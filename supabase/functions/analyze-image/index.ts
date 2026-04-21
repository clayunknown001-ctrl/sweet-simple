import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, image_base64, language = "en", fast = false } = await req.json();
    const langMap: Record<string, string> = {
      en: "English",
      uz: "O'zbek tilida (Uzbek)",
      ru: "Русский (Russian)",
    };
    const responseLang = langMap[language] || "English";
    if (!image_url && !image_base64) {
      return new Response(JSON.stringify({ error: "image_url or image_base64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const imageContent = image_base64
      ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
      : { type: "image_url", image_url: { url: image_url } };

    // FAST mode = brauzer real-time monitoring uchun (gemini flash, minimal output)
    // FULL mode = batafsil tahlil sahifasi uchun (gemini pro, full output)
    const model = fast ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";

    const systemPrompt = fast
      ? `You are a real-time browser content moderator (like a traffic radar — always watching, instant decision).
Response MUST be in ${responseLang}.

BLOCK (should_block: true) IMMEDIATELY if image contains ANY:
- Nudity (full/partial/implied), bikinis, lingerie, underwear, shirtless bodies
- Sexually suggestive poses, intimate touching, kissing, bed/bedroom scenes
- Tight/sheer/revealing clothing showing body shape
- Cleavage, midriff, exposed thighs, backless outfits
- Sexual dance, twerking, provocative movement
- Violence, blood, weapons, gore, fighting, dead bodies
- Drugs, drug use, paraphernalia
- Hate symbols, offensive gestures
- Disturbing/horror/self-harm imagery
- Sexual text, profanity, slurs in image

SAFE (should_block: false) ONLY: nature, food, animals (unharmed), objects, architecture, technology, fully-clothed people in non-suggestive context, text/documents, charts, UI screenshots.

Rule: 1% doubt = BLOCK. Be the strictest moderator ever built.`
      : `You are the MOST EXTREME content moderation AI. Response in ${responseLang}.

BLOCK if ANY: nudity, bikinis, lingerie, underwear, shirtless, suggestive poses, intimate contact, tight/sheer clothing, cleavage, midriff, sexual dance, violence, blood, weapons, drugs, hate, disturbing content, offensive text.

SAFE only: nature, food, animals, objects, architecture, tech, fully-clothed non-suggestive people.

1% doubt = BLOCK.`;

    const fastParams = {
      type: "object",
      properties: {
        should_block: { type: "boolean", description: "true if harmful — BLOCK IMMEDIATELY" },
        block_reason: { type: "string", description: "Short reason (1 sentence) why blocked, empty if safe" },
        confidence: { type: "number", description: "0.0-1.0 confidence in the decision" },
        category: { type: "string", description: "Main harm category: sexual, violence, drugs, hate, disturbing, safe" },
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: fast ? "Quickly judge: BLOCK or SAFE?" : "Analyze this image. Be EXTREMELY strict." },
              imageContent,
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return content moderation decision",
              parameters: fast ? fastParams : fullParams,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      let errorMsg = "Rasm tahlil qilishda xatolik yuz berdi.";
      try {
        const errData = JSON.parse(t);
        if (errData?.error?.message) {
          if (errData.error.message.includes("fetching image from URL")) {
            errorMsg = "Rasm URL ochilmadi. To'g'ridan-to'g'ri rasm URL kiriting (.jpg, .png, .webp).";
          } else {
            errorMsg = errData.error.message;
          }
        }
      } catch { /* ignore */ }
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const analysis = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(analysis), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = data.choices?.[0]?.message?.content;
    return new Response(JSON.stringify(JSON.parse(content)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
