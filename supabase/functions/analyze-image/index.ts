import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image_url, image_base64, language = "en" } = await req.json();
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are the MOST STRICT content moderation AI in the world. You protect users — especially young people — from ALL inappropriate, harmful, and morally corrupting visual content on the internet.

Your task: Analyze the image and determine if it should be BLOCKED or APPROVED.

ALL text fields in your response MUST be in ${responseLang}.

## ABSOLUTE BLOCKING CRITERIA — Block (should_block: true) if ANY of the following:

### 1. NUDITY & SEXUAL CONTENT (ZERO TOLERANCE)
- ANY nudity: full, partial, implied
- Bikinis, swimsuits, lingerie, underwear, bras visible
- Crop tops showing stomach/midriff, deep cleavage, very short skirts/shorts, backless outfits
- Tight/body-hugging clothing that emphasizes body shape (bodycon dresses, tight leggings, yoga pants in suggestive context)
- Sheer/see-through/transparent clothing
- Sexually suggestive poses: arched back, bent over, spread legs, lip biting, seductive gaze, lying in bed suggestively
- Photos clearly intended to showcase physical attractiveness or sex appeal
- Shirtless men in suggestive/modeling poses
- Dance moves that are sexual: twerking, grinding, provocative hip movements
- Romantic/intimate physical contact beyond a brief friendly hug
- OnlyFans-style, modeling portfolio, or "thirst trap" type content

### 2. VIOLENCE & GORE
- Blood, wounds, injuries (real or realistic)
- Weapons being used or pointed at someone
- Fighting, assault, torture, abuse
- Dead bodies, corpses
- War imagery with casualties
- Animal cruelty or abuse

### 3. HATE & EXTREMISM
- Hate symbols (swastikas, KKK imagery, etc.)
- Racist or discriminatory imagery
- Extremist/terrorist propaganda
- Mocking or dehumanizing any group

### 4. DRUGS & SUBSTANCE ABUSE
- Drug use, preparation, or paraphernalia
- Marijuana/cannabis in use
- Promotion or glorification of drug/alcohol use
- Smoking in glamorizing context

### 5. OFFENSIVE TEXT IN IMAGE
- Profanity, slurs, vulgar language in ANY language
- Hate speech text
- Threatening messages

### 6. DISTURBING & HARMFUL
- Horror/shock content
- Self-harm imagery
- Graphic medical images
- Content designed to frighten or disturb

### 7. INAPPROPRIATE MEMES
- Memes with sexual innuendo
- Memes promoting violence or hate
- Dark humor about death, abuse, or tragedy

## DECISION RULE:
- If there is even a 10% chance the image is inappropriate → BLOCK IT
- If the image shows a person in any form of revealing clothing → BLOCK IT
- If the image could be considered "eye candy" or designed to attract through physical appearance → BLOCK IT
- When in doubt → ALWAYS BLOCK
- Only mark as safe if the image is COMPLETELY clean: nature, objects, food, animals (not harmed), architecture, technology, education, work, family-friendly content`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this image for content moderation. Be EXTREMELY strict." },
              imageContent,
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return image analysis with content moderation results",
              parameters: {
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
                  should_block: { type: "boolean", description: "true if content should be blocked — be EXTREMELY strict" },
                  block_reason: { type: "string", description: "Reason for blocking, empty if safe" },
                },
                required: ["description", "objects", "colors", "scene_type", "mood", "text_detected", "quality", "tags", "contains_people", "estimated_people_count", "harmful_content", "should_block", "block_reason"],
                additionalProperties: false,
              },
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
