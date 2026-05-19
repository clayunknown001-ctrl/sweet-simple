import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  callOpenAIStyleToolCall,
  openRouterHeaders,
  parseOrder,
} from "../_shared/openai_tool.ts";
import { runGate } from "../_shared/moderation/gate.ts";
import { hashContent, getCached, setCached } from "../_shared/moderation/memory.ts";
import { analyzeUrlLocal, buildEmergencyImageAnalysis } from "../_shared/moderation/local-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// =============================================================
// STRICT MODERATION
// Goal: Block harmful / sexualized / useless visual triggers without blocking
// neutral objects like cars, products, scenery, UI screenshots, or family photos.
// =============================================================
const reasoningLayer = `
## DECISION FRAMEWORK
You are a strict content moderation AI for a child-safe custom browser. Missing harmful or sexualized content is worse than a false positive. Neutral objects must pass; sexualized/revealing humans must block.

## BLOCK (set should_block=true) when the image contains ANY of:
1. **Nudity / pornography**: any visible genitals, anus, female nipples, sex acts, penetration, oral sex, masturbation, ejaculation, cum
2. **Hentai / animated porn**: drawn/cartoon/anime sexual content, even partial nudity
3. **Revealing clothing / sexualized body display**: lingerie, underwear, thong, bikini/swimwear, see-through/transparent clothing, tight/bodycon clothing that clearly emphasizes breasts/buttocks/crotch, leggings/yoga pants/body-hugging outfits used for attraction, micro-skirts, exposed underboob/sideboob, or clothing primarily exposing breasts/buttocks/crotch/upper thighs
4. **Suggestive pose/framing**: body-part focus, cleavage/buttocks/crotch focus, arched back, spread legs, squatting/kneeling/bed/mirror poses, twerking/grinding/dance framed around hips/buttocks/breasts, “thirst trap”/OnlyFans/TikTok challenge/cosplay outfit framing, or a person presented mainly for sexual attraction even if walking/talking/traveling
5. **Violence / gore**: blood, open wounds, severed body parts, corpses, beheadings, executions, fighting with visible injury
6. **Self-harm / suicide**: cutting, hanging, suicide methods, glorification
7. **Hard drug use**: needles in arms, cooking drugs, smoking crack/meth, visible powder/pills with paraphernalia
8. **Hate symbols in glorifying context**: swastika, KKK, ISIS flags shown approvingly
9. **Weapons aimed at people / mass shooters posing**
10. **Pornographic text overlay** or sexual captions clearly visible in image

## APPROVE (should_block=false) for clearly neutral content:
- Fully clothed people in normal contexts (selfies, group photos, portraits)
- Fashion/product photos only when the person is fully clothed and not body-part focused
- Athletes in normal sportswear during real sport activity, unless body-part focused or sexualized
- Products, food, ads, packaging
- Cars, gadgets, machinery, screenshots
- Nature, animals, landscapes, architecture
- Memes (non-sexual), illustrations, charts
- Cartoons (non-pornographic), children's content
- Religious/cultural attire
- Kissing (non-explicit, clothed)
- Dance moves only when fully clothed and not focused on hips/buttocks/breasts/crotch; if the dancer's clothing or framing is sexualized, BLOCK

## CRITICAL RULES
- If the image is a FASHION/CATALOG product photo of underwear/bikini/lingerie on a model → BLOCK in this product, even if standard pose
- If the person is not fully clothed or the body is the main attraction → BLOCK
- "Attractive person" alone is NEVER a reason to block
- Confidence:
  - For categories 1, 2, 5, 6, 7 (nudity, hentai, gore, self-harm, drugs): block if confidence >= 0.55
  - For categories 3, 4 (revealing clothing / sexualized framing): block if confidence >= 0.42
  - Other categories: block if confidence >= 0.65
`;


function buildSystemPrompt(fast: boolean, responseLang: string) {
  const common = `You are a strict but accurate content moderation AI. Block porn, nudity, revealing/sexualized clothing, sexualized poses, gore, violence, self-harm, drugs. Approve neutral objects and fully clothed normal people.
Response language for block_reason: ${responseLang}.
${reasoningLayer}

Return JSON via the function. Be decisive — if a visible person is sexualized or revealing, block. Neutral non-human content = approve.`;
  return fast ? common : common + "\nThink step-by-step before deciding.";
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
    visual_signals: {
      type: "object",
      description: "Per-axis 0..1 estimates of visual erotic/behavior signals. Use 0 if absent.",
      properties: {
        skin_exposure:         { type: "number" },
        cleavage_emphasis:     { type: "number" },
        midriff_exposure:      { type: "number" },
        buttocks_emphasis:     { type: "number" },
        crotch_emphasis:       { type: "number" },
        thigh_exposure:        { type: "number" },
        clothing_tightness:    { type: "number" },
        clothing_transparency: { type: "number" },
        clothing_revealing:    { type: "number" },
        pose_suggestiveness:   { type: "number" },
        camera_body_focus:     { type: "number" },
        mirror_selfie:         { type: "boolean" },
        is_sport_activity:     { type: "boolean" },
        is_medical_or_educational: { type: "boolean" },
        is_fashion_runway:     { type: "boolean" },
        is_minor_present:      { type: "boolean" },
        scene_context:         { type: "string" },
      },
      required: ["skin_exposure","cleavage_emphasis","midriff_exposure","buttocks_emphasis","crotch_emphasis","thigh_exposure","clothing_tightness","clothing_transparency","clothing_revealing","pose_suggestiveness","camera_body_focus","mirror_selfie","is_sport_activity","is_medical_or_educational","is_fashion_runway","is_minor_present","scene_context"],
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
    const model = fast ? "google/gemini-3-flash-preview" : "google/gemini-2.5-flash";
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

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const hasAny = !!(GROQ_API_KEY || OPENROUTER_API_KEY || GEMINI_API_KEY || LOVABLE_API_KEY);
    if (!hasAny) throw new Error("No AI provider configured");

    const GROQ_VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL") || "llama-3.2-11b-vision-preview";
    const OPENROUTER_VISION_MODEL = Deno.env.get("OPENROUTER_VISION_MODEL") || "openai/gpt-4o-mini";

    const systemPrompt = buildSystemPrompt(fast, responseLang);
    const userText = "Analyze the visible image carefully. BLOCK if you see: nudity, hentai, lingerie/underwear/bikini/thong/revealing clothing, transparent or tight/bodycon/leggings/yoga-pants clothing emphasizing breasts/buttocks/crotch, cleavage/buttocks/crotch/body-part focus, squatting/kneeling/mirror/body-showing pose, twerking/grinding/sexualized dance, cosplay/outfit/look-swap/TikTok challenge framed for attraction, a person presented mainly for sexual attraction even if walking/talking/traveling, OnlyFans/thirst-trap framing, gore/violence/self-harm/drugs/hate, or pornographic text. APPROVE only neutral objects/scenery/products/cars and fully clothed normal people without sexualized framing. Be decisive — sexualized or revealing human content must be blocked.";
    const params = fast ? fastParams : fullParams;

    const imageContent = image_base64
      ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
      : { type: "image_url", image_url: { url: image_url } };

    const openAiUserContent = [
      { type: "text", text: userText },
      imageContent,
    ];

    async function callGroqVision() {
      const { args } = await callOpenAIStyleToolCall({
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: GROQ_API_KEY!,
        model: GROQ_VISION_MODEL,
        systemPrompt,
        userContent: openAiUserContent,
        toolName: "return_analysis",
        toolDescription: "Return content moderation decision",
        parameters: params,
      });
      return args;
    }

    async function callOpenRouterVision() {
      const { args } = await callOpenAIStyleToolCall({
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: OPENROUTER_API_KEY!,
        model: OPENROUTER_VISION_MODEL,
        systemPrompt,
        userContent: openAiUserContent,
        toolName: "return_analysis",
        toolDescription: "Return content moderation decision",
        parameters: params,
        extraHeaders: openRouterHeaders(),
      });
      return args;
    }

    const order = parseOrder(Deno.env.get("AI_PROVIDER_ORDER_IMAGE"), ["groq", "openrouter", "gemini", "lovable"]);

    let analysis: any = null;
    let providerUsed = "none";
    let firstError: any = null;

    for (const step of order) {
      if (analysis) break;
      try {
        if (step === "groq" && GROQ_API_KEY) {
          analysis = await callGroqVision();
          providerUsed = "groq";
        } else if (step === "openrouter" && OPENROUTER_API_KEY) {
          analysis = await callOpenRouterVision();
          providerUsed = "openrouter";
        } else if (step === "gemini" && GEMINI_API_KEY) {
          analysis = await callGoogleAIStudio({
            apiKey: GEMINI_API_KEY, fast, systemPrompt, userText,
            imageBase64: image_base64, imageUrl: image_url,
            mimeType: "image/jpeg", params,
          });
          providerUsed = "google-ai-studio";
        } else if (step === "lovable" && LOVABLE_API_KEY) {
          analysis = await callLovableGateway({
            apiKey: LOVABLE_API_KEY, fast, systemPrompt, userText, imageContent, params,
          });
          providerUsed = "lovable-gateway";
        }
      } catch (e: any) {
        if (!firstError) firstError = e;
        console.warn(`Image provider ${step} failed:`, e?.message?.slice?.(0, 200) ?? e);
      }
    }

    if (!analysis) {
      console.warn("⚠️ All image providers failed, using local URL engine:", firstError?.message);
      analysis = buildEmergencyImageAnalysis(image_url);
      providerUsed = "local-emergency";
    }

    // Pre-emptive URL block (unsafe domain) — overrides if model returned safe
    const urlLocal = analyzeUrlLocal(image_url);
    if (urlLocal.verdict === "harmful" && urlLocal.confidence >= 0.9) {
      analysis.should_block = true;
      analysis.harmful_content = analysis.harmful_content || {};
      analysis.harmful_content.is_harmful = true;
      analysis.harmful_content.severity = "high";
      analysis.block_reason = `Unsafe domain: ${urlLocal.signals.join(", ")}`;
    }

    const contentHash = await hashContent(`image:${image_url ?? (image_base64?.slice(0, 256) ?? "")}`);
    const gated = runGate({ analysis, kind: "image", contentHash });
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
    console.error("analyze-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", should_block: false }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
