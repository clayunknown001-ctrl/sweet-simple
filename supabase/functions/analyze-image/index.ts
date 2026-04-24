import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const reasoningLayer = `
## BEHAVIORAL REASONING LAYER (How Human Feelings Work):
Before deciding, REASON like a neuroscientist + psychologist:
1. DOPAMINE & REWARD CIRCUIT (Kühn & Gallinat, 2014): sexual/suggestive imagery shrinks striatum → BLOCK arousal-bait.
2. PREFRONTAL CORTEX HIJACK (PMC7328032): lust shuts down judgment → BLOCK thirst-traps.
3. DESENSITIZATION & OBJECTIFICATION: BLOCK content reducing humans to body parts.
4. EVOLUTIONARY SIGNAL (Darwin): lust ≠ love; protect from algorithmic exploitation.
5. COMPULSION LOOP (Love et al., 2016): when in doubt, BLOCK.

REASONING: Step 1 what's shown → Step 2 emotion engineered → Step 3 wellbeing or hijack → Step 4 APPROVE/BLOCK.
`;

function buildSystemPrompt(fast: boolean, responseLang: string) {
  return fast
    ? `You are a real-time browser content moderator with neuropsychology expertise. Response in ${responseLang}.
${reasoningLayer}
BLOCK if ANY: nudity, bikinis, lingerie, underwear, shirtless, suggestive poses, intimate touching, kissing, bed scenes, tight/sheer clothing, cleavage, midriff, exposed thighs, sexual dance, thirst-trap framing, violence, blood, weapons, gore, drugs, hate symbols, disturbing/horror/self-harm, sexual text/profanity.
SAFE only: nature, food, animals (unharmed), objects, architecture, tech, fully-clothed non-suggestive people, text/documents, charts, UI screenshots.
1% doubt = BLOCK.`
    : `MOST EXTREME content moderator with neuropsychological reasoning. Response in ${responseLang}.
${reasoningLayer}
BLOCK if ANY: nudity, bikinis, lingerie, underwear, shirtless, suggestive poses, intimate contact, tight/sheer clothing, cleavage, midriff, sexual dance, violence, blood, weapons, drugs, hate, disturbing content, offensive text, arousal-engineered framing.
SAFE only: nature, food, animals, objects, architecture, tech, fully-clothed non-suggestive people in wholesome contexts.
Apply 4-step reasoning. 1% doubt = BLOCK.`;
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
    objects: { type: "array", items: { type: "string" } },
    colors: { type: "array", items: { type: "string" } },
    scene_type: { type: "string" },
    mood: { type: "string" },
    text_detected: { type: "string" },
    quality: { type: "string", enum: ["low", "medium", "high"] },
    tags: { type: "array", items: { type: "string" } },
    contains_people: { type: "boolean" },
    estimated_people_count: { type: "number" },
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
  required: ["description", "objects", "colors", "scene_type", "mood", "text_detected", "quality", "tags", "contains_people", "estimated_people_count", "harmful_content", "should_block", "block_reason"],
  additionalProperties: false,
};

// Google's Gemini API rejects `additionalProperties`. Strip it recursively.
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

// ============ PROVIDER 1: Google AI Studio (FREE) ============
async function callGoogleAIStudio({
  apiKey, fast, systemPrompt, userText, imageBase64, imageUrl, mimeType, params,
}: {
  apiKey: string; fast: boolean; systemPrompt: string; userText: string;
  imageBase64?: string; imageUrl?: string; mimeType: string; params: any;
}) {
  const model = fast ? "gemini-2.5-flash-lite" : "gemini-2.5-flash";

  // If only URL provided, fetch and convert to base64
  let b64 = imageBase64;
  let mt = mimeType;
  if (!b64 && imageUrl) {
    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error(`Failed to fetch image URL: ${r.status}`);
    mt = r.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    b64 = btoa(bin);
  }
  if (!b64) throw new Error("No image data");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      role: "user",
      parts: [
        { text: userText },
        { inline_data: { mime_type: mt, data: b64 } },
      ],
    }],
    tools: [{
      functionDeclarations: [{
        name: "return_analysis",
        description: "Return content moderation decision",
        parameters: params,
      }],
    }],
    toolConfig: {
      functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["return_analysis"] },
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
  // Fallback: try to parse text as JSON
  const text = parts.map((p: any) => p.text).filter(Boolean).join("");
  if (text) {
    try { return JSON.parse(text); } catch { /* ignore */ }
  }
  throw new Error("Google AI Studio: no function call in response");
}

// ============ PROVIDER 2: Lovable AI Gateway (PAID FALLBACK) ============
async function callLovableGateway({
  apiKey, fast, systemPrompt, userText, imageContent, params,
}: {
  apiKey: string; fast: boolean; systemPrompt: string; userText: string;
  imageContent: any; params: any;
}) {
  const model = fast ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-pro";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [{ type: "text", text: userText }, imageContent] },
      ],
      tools: [{
        type: "function",
        function: { name: "return_analysis", description: "Return content moderation decision", parameters: params },
      }],
      tool_choice: { type: "function", function: { name: "return_analysis" } },
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
    const { image_url, image_base64, language = "en", fast = false } = await req.json();
    const langMap: Record<string, string> = {
      en: "English", uz: "O'zbek tilida (Uzbek)", ru: "Русский (Russian)",
    };
    const responseLang = langMap[language] || "English";
    if (!image_url && !image_base64) {
      return new Response(JSON.stringify({ error: "image_url or image_base64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) throw new Error("No AI provider configured");

    const systemPrompt = buildSystemPrompt(fast, responseLang);
    const userText = fast ? "Quickly judge: BLOCK or SAFE?" : "Analyze this image. Be EXTREMELY strict.";
    const params = fast ? fastParams : fullParams;

    // Try Google AI Studio first (FREE)
    let analysis: any = null;
    let providerUsed = "none";
    let firstError: any = null;

    if (GEMINI_API_KEY) {
      try {
        analysis = await callGoogleAIStudio({
          apiKey: GEMINI_API_KEY, fast, systemPrompt, userText,
          imageBase64: image_base64, imageUrl: image_url,
          mimeType: "image/jpeg", params,
        });
        providerUsed = "google-ai-studio";
        console.log("✅ Used Google AI Studio (FREE)");
      } catch (e: any) {
        firstError = e;
        console.warn("⚠️ Google AI Studio failed, falling back:", e?.message);
      }
    }

    // Fallback: Lovable Gateway
    if (!analysis && LOVABLE_API_KEY) {
      const imageContent = image_base64
        ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
        : { type: "image_url", image_url: { url: image_url } };
      try {
        analysis = await callLovableGateway({
          apiKey: LOVABLE_API_KEY, fast, systemPrompt, userText, imageContent, params,
        });
        providerUsed = "lovable-gateway";
        console.log("✅ Used Lovable Gateway (paid)");
      } catch (e: any) {
        if (e?.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (e?.status === 402) {
          return new Response(JSON.stringify({ error: "Both AI providers exhausted. Top up Google AI Studio quota or Lovable AI credits." }), {
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
    console.error("analyze-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
