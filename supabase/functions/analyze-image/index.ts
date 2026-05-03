import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// =============================================================
// BEHAVIORAL REASONING — Neuroscience + Psychology grounded
// Sources: Kühn & Gallinat 2014, Love et al 2016, PMC7328032,
// Wikipedia: Effects of pornography, Darwin: From So Simple a Beginning
// =============================================================
const reasoningLayer = `
## NEUROPSYCHOLOGICAL REASONING (apply silently before deciding):

A. DOPAMINE & REWARD CIRCUIT (Kühn & Gallinat, 2014):
   Sexual/arousal-engineered imagery triggers excessive dopamine release → over time SHRINKS striatum, reduces gray matter, causes desensitization. Block content engineered to trigger this loop.

B. PREFRONTAL CORTEX HIJACK (PMC7328032, Love et al. 2016):
   Lust-imagery shuts down judgment within 200ms. User cannot "decide" — the brain is hijacked before conscious thought. Therefore: BLOCK BEFORE the hijack happens, not after.

C. ALGORITHMIC EXPLOITATION:
   Modern platforms (Instagram, Pinterest, TikTok) optimize for engagement = arousal. Thirst-trap framing, dance reels with hip emphasis, mirror-selfie + minimal clothing, profile photos with seductive intent — these are ENGINEERED to bypass judgment. Block them even when "no nudity".

D. EVOLUTIONARY SIGNAL (Darwin):
   Lust ≠ love ≠ wellbeing. Sexual selection is a mechanism for reproduction, not human flourishing. Don't conflate "natural" with "harmless".

E. CONTEXT MATTERS (avoid false positives):
   - A clothed woman in a car ad → SAFE
   - A clothed man giving a presentation → SAFE
   - A family photo at the beach → SAFE
   - Children, food, animals (unharmed), nature, tech, architecture → SAFE
   - A medical/educational diagram → SAFE
   - A clothed athlete in sports context → SAFE

## DECISION FRAMEWORK (think step by step):
Step 1: What is literally shown? (objects, people, clothing, pose, setting)
Step 2: Is the framing engineered for arousal? (camera angle on body parts, mirror selfies, lip emphasis, hip emphasis, suggestive pose)
Step 3: Is the context legitimate? (commerce, news, education, family, sports, art)
Step 4: Would showing this hijack the viewer's prefrontal cortex (B above)?
   → YES = BLOCK
   → NO = APPROVE

## LUST/AROUSAL TRIGGER COMBINATIONS (BLOCK these):
- Bikini, lingerie, underwear, swimsuit (any)
- Cleavage emphasis, midriff exposure, exposed thighs in non-sport context
- See-through, body-hugging fabric in non-fitness context
- Mirror selfies + minimal/tight clothing
- Lip emphasis + eye contact + suggestive pose
- Hip emphasis, twerking, grinding, seductive dancing
- Profile photos with seductive framing
- "Art" nudity (still BLOCK — same brain effect)
- Beach/pool photos where focus is body, not activity
- Fitness content where camera lingers on body, not exercise

## VIOLENCE / OTHER HARM (BLOCK):
- Blood, gore, wounds, corpses
- Weapons in active/threatening use
- Drug use, paraphernalia
- Hate symbols (swastika, etc.)
- Self-harm, suicide imagery
- Disturbing/horror imagery
- Sexual or profane on-screen text
`;

function buildSystemPrompt(fast: boolean, responseLang: string) {
  const common = `You are a content moderation AI for a browser radar that protects users from harmful/arousing content.
Response language for block_reason: ${responseLang}.
${reasoningLayer}

CRITICAL CALIBRATION:
- Judge the visible image/frame itself. Do NOT block an entire social feed, Reels page, Pinterest grid, or normal image because of the platform/source.
- Default to APPROVE for: cars, food, nature, animals, architecture, tech, fully-clothed people in normal contexts, charts, text, UI screenshots, art (non-nude), educational content, news, sports (non-arousal-framed), product photos, normal Pinterest pins.
- BLOCK when the visible frame clearly contains: nudity, underwear/lingerie, exposed intimate body focus, sexual/seductive pose, twerking/grinding, pornographic text, gore, active violence, self-harm, hard drugs, hate symbols.
- "Clothed person" alone is NOT a reason to block. A normal selfie, family photo, fashion/product image, or ordinary reel frame is SAFE unless the visible framing is sexualized.
- When uncertain about a normal clothed person/object/product → APPROVE.
- When the framing is clearly engineered for arousal or harm is visible → BLOCK.

Return confidence between 0 and 1. Only set should_block=true when the visible content itself contains a concrete block trigger.`;

  return fast
    ? `${common}\nRespond quickly with a binary decision.`
    : `${common}\nApply the full 4-step reasoning framework before deciding.`;
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
    confidence: { type: "number" },
  },
  required: ["description", "objects", "colors", "scene_type", "mood", "text_detected", "quality", "tags", "contains_people", "estimated_people_count", "harmful_content", "should_block", "block_reason", "confidence"],
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

// ============ PROVIDER 1: Google AI Studio (FREE, low quota) ============
async function callGoogleAIStudio({
  apiKey, fast, systemPrompt, userText, imageBase64, imageUrl, mimeType, params,
}: {
  apiKey: string; fast: boolean; systemPrompt: string; userText: string;
  imageBase64?: string; imageUrl?: string; mimeType: string; params: any;
}) {
  const model = fast ? "gemini-2.5-flash-lite" : "gemini-2.5-flash";

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
        parameters: stripUnsupported(params),
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
  const text = parts.map((p: any) => p.text).filter(Boolean).join("");
  if (text) {
    try { return JSON.parse(text); } catch { /* ignore */ }
  }
  throw new Error("Google AI Studio: no function call in response");
}

// ============ PROVIDER 2: Lovable AI Gateway (PAID) ============
async function callLovableGateway({
  apiKey, fast, systemPrompt, userText, imageContent, params,
}: {
  apiKey: string; fast: boolean; systemPrompt: string; userText: string;
  imageContent: any; params: any;
}) {
  const model = fast ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-flash";
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
    const userText = fast
      ? "Judge only the visible image/frame. APPROVE normal Pinterest pins, normal clothed people, products, cars, food, UI, and ordinary reels. BLOCK only if a concrete sexual/violent/harm trigger is visibly present."
      : "Analyze only the visible image/frame with the 4-step framework. Do not infer from platform/feed; block only visible sexualized or harmful content.";
    const params = fast ? fastParams : fullParams;

    let analysis: any = null;
    let providerUsed = "none";
    let firstError: any = null;

    // Try Google first (free but limited)
    if (GEMINI_API_KEY) {
      try {
        analysis = await callGoogleAIStudio({
          apiKey: GEMINI_API_KEY, fast, systemPrompt, userText,
          imageBase64: image_base64, imageUrl: image_url,
          mimeType: "image/jpeg", params,
        });
        providerUsed = "google-ai-studio";
      } catch (e: any) {
        firstError = e;
        if (e?.status !== 429) console.warn("Google AI Studio failed:", e?.message?.slice(0, 200));
      }
    }

    // Fallback to Lovable Gateway
    if (!analysis && LOVABLE_API_KEY) {
      const imageContent = image_base64
        ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
        : { type: "image_url", image_url: { url: image_url } };
      try {
        analysis = await callLovableGateway({
          apiKey: LOVABLE_API_KEY, fast, systemPrompt, userText, imageContent, params,
        });
        providerUsed = "lovable-gateway";
      } catch (e: any) {
        if (e?.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded.", should_block: false }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (e?.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted.", should_block: false }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw e;
      }
    }

    if (!analysis) {
      const msg = firstError?.message || "All AI providers failed";
      return new Response(JSON.stringify({ error: msg, should_block: false }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confidence-gated blocking — protects against false positives
    const conf = typeof analysis.confidence === "number" ? analysis.confidence : 0.8;
    const categoryText = String([analysis.category, analysis.block_reason, ...(analysis?.harmful_content?.categories || [])].filter(Boolean).join(" ")).toLowerCase();
    const hardRisk = /nud|porn|sex|lingerie|underwear|hentai|gore|violence|weapon|self-harm|suicide|drug|hate|behayo|zo'ravon|yalang/.test(categoryText);
    const minBlockConfidence = hardRisk ? 0.55 : 0.68;
    if (analysis.should_block && conf < minBlockConfidence) {
      analysis.should_block = false;
      analysis.block_reason = "Low confidence — approved";
    }

    return new Response(JSON.stringify({ ...analysis, _provider: providerUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", should_block: false }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
