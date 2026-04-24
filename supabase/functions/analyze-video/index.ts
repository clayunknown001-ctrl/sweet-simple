import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const reasoningLayer = `
## BEHAVIORAL REASONING LAYER (Neuroscience):
1. DOPAMINE LOOP (Kühn & Gallinat 2014): video > images for addiction → BLOCK arousal-engineered video.
2. PREFRONTAL SHUTDOWN: motion+sound hijacks judgment → BLOCK before brain is hijacked.
3. ALGORITHMIC WEAPONIZATION: counter the algorithm exploiting primal drives.
4. COMPULSION (Love et al. 2016): 3 sec arousing video = craving cycle. ANY bad frame = BLOCK ALL.
5. EVOLUTIONARY: lust ≠ wellbeing.

REASONING: frames → emotion engineered → serves user or hijacks → APPROVE/BLOCK. 1% doubt = BLOCK.
`;

function buildSystemPrompt(fast: boolean, responseLang: string) {
  return fast
    ? `Real-time video moderator (radar) with neuropsychology. Response in ${responseLang}.
${reasoningLayer}
BLOCK if ANY frame: nudity, bikinis, lingerie, underwear, shirtless, suggestive poses/movements, intimate touching, kissing, bed scenes, tight/sheer clothing, cleavage, midriff, exposed thighs, twerking/grinding/provocative dance, thirst-trap reels, violence, blood, weapons, gore, drugs, hate symbols, horror, self-harm, sexual/profane on-screen text.
SAFE only: nature, food, animals (unharmed), objects, architecture, tech, fully-clothed non-suggestive people, education, tutorials.
ANY single bad frame = BLOCK entire video.`
    : `MOST EXTREME video moderator. Response in ${responseLang}.
${reasoningLayer}
BLOCK if ANY frame: nudity, bikinis, suggestive content, intimate contact, sexual dance, violence, blood, drugs, hate, disturbing, arousal-engineered framing.
SAFE only: nature, food, animals, objects, architecture, tech, fully-clothed non-suggestive content.
1% doubt = BLOCK.`;
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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) throw new Error("No AI provider configured");

    const systemPrompt = buildSystemPrompt(fast, responseLang);
    const userText = fast ? "Quickly judge every frame: BLOCK or SAFE?" : "Analyze this video. Check EVERY frame. Be EXTREMELY strict.";
    const params = fast ? fastParams : fullParams;

    let analysis: any = null;
    let providerUsed = "none";
    let firstError: any = null;

    if (GEMINI_API_KEY) {
      try {
        analysis = await callGoogleAIStudio({
          apiKey: GEMINI_API_KEY, fast, systemPrompt, userText,
          videoBase64: video_base64, mimeType: mime_type, params,
        });
        providerUsed = "google-ai-studio";
        console.log("✅ Video: Used Google AI Studio (FREE)");
      } catch (e: any) {
        firstError = e;
        console.warn("⚠️ Google AI Studio failed, falling back:", e?.message);
      }
    }

    if (!analysis && LOVABLE_API_KEY) {
      try {
        analysis = await callLovableGateway({
          apiKey: LOVABLE_API_KEY, fast, systemPrompt, userText,
          videoBase64: video_base64, mimeType: mime_type, params,
        });
        providerUsed = "lovable-gateway";
        console.log("✅ Video: Used Lovable Gateway (paid)");
      } catch (e: any) {
        if (e?.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (e?.status === 402) {
          return new Response(JSON.stringify({ error: "Both AI providers exhausted." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw e;
      }
    }

    if (!analysis) {
      const msg = firstError?.message || "All AI providers failed";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ...analysis, _provider: providerUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-video error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
