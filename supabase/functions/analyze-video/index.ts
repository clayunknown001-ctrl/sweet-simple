import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  callOpenAIStyleToolCall,
  openRouterHeaders,
  parseOrder,
} from "../_shared/openai_tool.ts";
import { runGate } from "../_shared/moderation/gate.ts";
import { hashContent, setCached } from "../_shared/moderation/memory.ts";
import { buildEmergencyVideoAnalysis } from "../_shared/moderation/local-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const reasoningLayer = `
## NEUROPSYCHOLOGICAL REASONING (apply silently):
A. DOPAMINE LOOP (Kühn & Gallinat 2014): motion video amplifies arousal → striatum shrinkage → block engineered-for-arousal video.
B. PREFRONTAL HIJACK (PMC7328032, Love et al 2016): motion+sound shuts down judgment in <200ms; block BEFORE the hijack.
C. ALGORITHMIC EXPLOITATION: TikTok/Instagram/YT-Shorts reels are tuned for arousal — thirst-trap framing, hip emphasis, mirror dances, lip+eye-contact, slow-pan over body. Block even when "no nudity".
D. EVOLUTIONARY: sexual selection ≠ human flourishing. Don't conflate "natural" with "harmless".

E. SAFE CONTEXTS (avoid false positives — APPROVE):
   - Cars, food, animals, nature, architecture, tech demos, charts, tutorials
   - News anchors, educational lectures, sports broadcasts (non-arousal-framed)
   - Fully-clothed people in normal commerce/family/work context
   - Cooking, travel vlogs (non-body-focused), music videos (no suggestive choreo)

## DECISION FRAMEWORK (per-frame, then aggregate):
1. Identify the literal scene (objects, people, clothing, action, setting).
2. Is the framing engineered for arousal? (slow pan over body, hip/cleavage emphasis, mirror selfie, lip emphasis, suggestive choreo)
3. Is the context legitimate (commerce, news, education, sports, family, art)?
4. Would this hijack the viewer's prefrontal cortex? YES → BLOCK; NO → APPROVE.

## AROUSAL TRIGGERS (BLOCK with confidence > 0.42):
- Bikini, lingerie, underwear, swimsuit (any context)
- Cleavage / midriff emphasis, exposed thighs in non-sport context
- See-through, body-hugging fabric outside fitness drills
- Tight/bodycon dress, leggings/yoga pants, cosplay/outfit/look-swap/try-on/TikTok challenge when body shape is the main attraction
- Visible breasts/buttocks/hips/crotch emphasis, even if clothed and even if the person is only walking/talking
- Mirror selfie + minimal/tight clothing
- Twerking, grinding, hip-thrusting, seductive choreography
- Thirst-trap reels (camera lingers on body, not activity)
- Lip emphasis + eye-contact + suggestive pose
- "Art" nudity (same brain effect — still BLOCK)
- Fitness videos where camera focuses on body, not technique

## OTHER HARM (BLOCK):
- Blood, gore, wounds, corpses
- Weapons in active/threatening use
- Drug use, paraphernalia
- Hate symbols (swastika, etc.)
- Self-harm, suicide imagery
- Horror/disturbing imagery
- Sexual or profane on-screen text

CALIBRATION: For child-safe browsing, missing sexualized video is worse than false positive. Block arousal/framing triggers at confidence >= 0.42.
`;

function buildSystemPrompt(fast: boolean, responseLang: string) {
  const common = `You are a real-time video content moderator for a browser/OS radar protecting users from arousal-engineered and harmful content.
Response language for block_reason: ${responseLang}.
${reasoningLayer}
Return confidence between 0 and 1. Block if sexualized/revealing video confidence >= 0.42.`;

  return fast
    ? `${common}\nQuickly judge: do ANY frames contain a clear arousal trigger or harm category? Default APPROVE.`
    : `${common}\nApply the full per-frame framework. Aggregate before deciding.`;
}

const fastParams = {
  type: "object",
  properties: {
    should_block: { type: "boolean" },
    block_reason: { type: "string" },
    confidence: { type: "number" },
    category: { type: "string" },
  },
  required: ["should_block", "block_reason", "confidence", "category"],
  additionalProperties: false,
};

const fullParams = {
  type: "object",
  properties: {
    description: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: { timestamp: { type: "string" }, description: { type: "string" } },
        required: ["timestamp", "description"],
        additionalProperties: false,
      },
    },
    objects: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
    mood: { type: "string" },
    category: { type: "string" },
    contains_speech: { type: "boolean" },
    speech_summary: { type: "string" },
    contains_people: { type: "boolean" },
    estimated_people_count: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
    quality: { type: "string", enum: ["low", "medium", "high"] },
    harmful_content: {
      type: "object",
      properties: {
        is_harmful: { type: "boolean" },
        severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
        categories: { type: "array", items: { type: "string" } },
        details: { type: "string" },
      },
      required: ["is_harmful", "severity", "categories", "details"],
      additionalProperties: false,
    },
    should_block: { type: "boolean" },
    block_reason: { type: "string" },
  },
  required: ["description", "scenes", "objects", "actions", "mood", "category", "contains_speech", "speech_summary", "contains_people", "estimated_people_count", "tags", "quality", "harmful_content", "should_block", "block_reason"],
  additionalProperties: false,
};

function stripUnsupported(schema: any): any {
  if (Array.isArray(schema)) return schema.map(stripUnsupported);
  if (schema && typeof schema === "object") {
    const out: any = {};
    for (const k of Object.keys(schema)) {
      if (k === "additionalProperties") continue;
      out[k] = stripUnsupported(schema[k]);
    }
    return out;
  }
  return schema;
}

async function callGoogleAIStudio({
  apiKey, fast, systemPrompt, userText, videoBase64, mimeType, params,
}: {
  apiKey: string; fast: boolean; systemPrompt: string; userText: string;
  videoBase64: string; mimeType: string; params: any;
}) {
  const model = fast ? "gemini-2.5-flash-lite" : "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: "user",
      parts: [
        { text: userText },
        { inline_data: { mime_type: mimeType, data: videoBase64 } },
      ],
    }],
    tools: [{
      functionDeclarations: [{
        name: "return_video_analysis",
        description: "Return video moderation decision",
        parameters: stripUnsupported(params),
      }],
    }],
    toolConfig: {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["return_video_analysis"] },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    const err: any = new Error(`Google AI Studio ${res.status}: ${t}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.functionCall?.args) return p.functionCall.args;
  }
  const text = parts.map((p: any) => p.text).filter(Boolean).join("");
  if (text) {
    try { return JSON.parse(text); } catch { /* ignore */ }
  }
  throw new Error("Google AI Studio: no function call in response");
}

async function callOpenRouterVideo({
  apiKey, fast: _fast, systemPrompt, userText, videoBase64, mimeType, params,
}: {
  apiKey: string; fast: boolean; systemPrompt: string; userText: string;
  videoBase64: string; mimeType: string; params: any;
}) {
  const model = Deno.env.get("OPENROUTER_VIDEO_MODEL") || "openai/gpt-4o";
  const content = [
    { type: "text", text: userText },
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${videoBase64}` } },
  ];
  const { args } = await callOpenAIStyleToolCall({
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey,
    model,
    systemPrompt,
    userContent: content,
    toolName: "return_video_analysis",
    toolDescription: "Return video moderation decision",
    parameters: params,
    extraHeaders: openRouterHeaders(),
  });
  return args;
}

async function callLovableGateway({
  apiKey, fast, systemPrompt, userText, videoBase64, mimeType, params,
}: {
  apiKey: string; fast: boolean; systemPrompt: string; userText: string;
  videoBase64: string; mimeType: string; params: any;
}) {
  const model = fast ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${videoBase64}` } },
          ],
        },
      ],
      tools: [{
        type: "function",
        function: { name: "return_video_analysis", description: "Return video moderation decision", parameters: params },
      }],
      tool_choice: { type: "function", function: { name: "return_video_analysis" } },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    const err: any = new Error(`Lovable Gateway ${res.status}: ${t}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (tc) return JSON.parse(tc.function.arguments);
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_base64, mime_type = "video/mp4", language = "en", fast = false } = await req.json();
    if (!video_base64) {
      return new Response(JSON.stringify({ error: "video_base64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const langMap: Record<string, string> = { en: "English", uz: "O'zbek tilida (Uzbek)", ru: "Русский (Russian)" };
    const responseLang = langMap[language] || "English";

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!GEMINI_API_KEY && !OPENROUTER_API_KEY && !LOVABLE_API_KEY) {
      throw new Error("No AI provider configured (need GEMINI, OPENROUTER, or LOVABLE for video)");
    }

    const systemPrompt = buildSystemPrompt(fast, responseLang);
    const userText = fast
      ? "Block if any frame has revealing/tight clothing, body-part emphasis, sexualized dance/pose, cosplay/outfit/TikTok challenge thirst-trap framing, or harm. Use threshold 0.42 for sexualized video."
      : "Apply the per-frame framework. Block if any frame has sexualized/revealing clothing, body-part focus, or arousal-engineered framing; threshold 0.42.";
    const params = fast ? fastParams : fullParams;

    const videoOrder = parseOrder(Deno.env.get("AI_PROVIDER_ORDER_VIDEO"), ["gemini", "openrouter", "lovable"]);

    let analysis: any = null;
    let providerUsed = "none";
    let firstError: any = null;

    for (const step of videoOrder) {
      if (analysis) break;
      try {
        if (step === "gemini" && GEMINI_API_KEY) {
          analysis = await callGoogleAIStudio({
            apiKey: GEMINI_API_KEY, fast, systemPrompt, userText,
            videoBase64: video_base64, mimeType: mime_type, params,
          });
          providerUsed = "google-ai-studio";
          console.log("✅ Video: Google AI Studio");
        } else if (step === "openrouter" && OPENROUTER_API_KEY) {
          analysis = await callOpenRouterVideo({
            apiKey: OPENROUTER_API_KEY, fast, systemPrompt, userText,
            videoBase64: video_base64, mimeType: mime_type, params,
          });
          providerUsed = "openrouter";
          console.log("✅ Video: OpenRouter");
        } else if (step === "lovable" && LOVABLE_API_KEY) {
          analysis = await callLovableGateway({
            apiKey: LOVABLE_API_KEY, fast, systemPrompt, userText,
            videoBase64: video_base64, mimeType: mime_type, params,
          });
          providerUsed = "lovable-gateway";
          console.log("✅ Video: Lovable Gateway");
        }
      } catch (e: any) {
        if (!firstError) firstError = e;
        console.warn(`⚠️ Video provider ${step} failed:`, e?.message);
      }
    }

    if (!analysis) {
      const msg = firstError?.message || "All AI providers failed";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentHash = await hashContent(`video:${(video_base64 ?? "").slice(0, 256)}`);
    const gated = runGate({ analysis, kind: "video", contentHash });
    setCached(contentHash, gated.analysis);

    return new Response(JSON.stringify({
      ...gated.analysis,
      _provider: providerUsed,
      _decision: {
        id: contentHash,
        verdict: gated.verdict,
        category: gated.category,
        confidence: gated.confidence,
        threshold: gated.threshold,
        reasoning: gated.reasoning,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-video error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
