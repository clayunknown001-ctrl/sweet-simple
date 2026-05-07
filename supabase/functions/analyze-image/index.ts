import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
3. **Revealing clothing / sexualized body display**: lingerie, underwear, thong, bikini/swimwear, see-through/transparent clothing, tight/bodycon clothing that clearly emphasizes breasts/buttocks/crotch, micro-skirts, exposed underboob/sideboob, or clothing primarily exposing breasts/buttocks/crotch/upper thighs
4. **Suggestive pose/framing**: body-part focus, cleavage/buttocks/crotch focus, arched back, spread legs, crawling/bed poses, twerking/grinding/dance framed around hips/buttocks/breasts, “thirst trap”/OnlyFans-style framing, or a woman presented mainly for sexual attraction even if she is only walking/talking/traveling
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
  - For categories 3, 4 (revealing clothing / sexualized framing): block if confidence >= 0.55
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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!GEMINI_API_KEY && !LOVABLE_API_KEY) throw new Error("No AI provider configured");

    const systemPrompt = buildSystemPrompt(fast, responseLang);
    const userText = "Analyze the visible image carefully. BLOCK if you see: nudity (genitals/nipples/sex act), hentai, lingerie/underwear/bikini/thong/revealing clothing on a person, cleavage/buttocks/crotch/body-part focus, twerking/grinding/sexualized dance, OnlyFans/thirst-trap framing, gore/blood/wounds/corpses, active violence, self-harm, hard drug use with paraphernalia, hate symbols glorified, or pornographic text. APPROVE only neutral objects/scenery/products/cars and fully clothed normal people. Be decisive — harmful/sexualized content must be blocked.";
    const params = fast ? fastParams : fullParams;

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
      } catch (e: any) {
        firstError = e;
        if (e?.status !== 429) console.warn("Google AI Studio failed:", e?.message?.slice(0, 200));
      }
    }

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

    // Soft confidence gate — modelni hurmat qilamiz, lekin past confidence'da
    // tekshirib ko'ramiz. Hard trigger bo'lsa 0.55, aks holda 0.65 yetarli.
    const conf = typeof analysis.confidence === "number" ? analysis.confidence : 0.6;
    const categoryText = String([analysis.category, analysis.block_reason, ...(analysis?.harmful_content?.categories || [])].filter(Boolean).join(" ")).toLowerCase();
    const hardTrigger = /nud|porn|genital|nipple|sex|penetrat|hentai|gore|blood|wound|corpse|weapon|self.?harm|suicide|drug|hate|swastika|behayo|zo'ravon|yalang|erotic|lingerie|seductive|underwear|bikini|thong|swimwear|cleavage|butt|crotch|twerk|grind|revealing|body.?part/.test(categoryText);
    if (analysis.should_block) {
      const minConf = hardTrigger ? 0.48 : 0.62;
      if (conf < minConf) {
        analysis.should_block = false;
        analysis.block_reason = "Approved — low confidence";
      }
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
