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
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an EXTREMELY STRICT content moderation AI for a safe browser. Your job is to protect users from ALL inappropriate visual content.

Analyze the given image and return structured results. ALL text fields MUST be in ${responseLang}.

BLOCKING CRITERIA — Flag and block (should_block: true) if ANY of these are present:
1. NUDITY & SEXUAL CONTENT:
   - Full or partial nudity
   - Semi-nudity: bikinis, swimsuits, lingerie, underwear, crop tops showing midriff, deep cleavage, very short skirts/shorts
   - Sexually suggestive poses: arched back, bent over, spread legs, lip biting, seductive gaze
   - Tight/revealing clothing that emphasizes body curves (tight leggings, bodycon dresses, see-through clothing)
   - Any image clearly designed to be sexually attractive or arousing
   - Shirtless men in suggestive poses
2. VIOLENCE & GORE: Blood, wounds, weapons used violently, fighting, torture, dead bodies
3. HATE & EXTREMISM: Hate symbols, racist imagery, extremist propaganda
4. DRUGS: Drug use, drug paraphernalia, promotion of drug use
5. OFFENSIVE TEXT: Profanity, slurs, hate speech, threats in ANY language
6. DISTURBING: Horror, shock content, self-harm imagery

IMPORTANT: Be EXTREMELY strict. If a photo shows a person in revealing, tight, or suggestive clothing — BLOCK IT. 
If the image appears designed to be sexually appealing — BLOCK IT.
When in doubt — BLOCK IT. Safety is the top priority.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this image for content moderation." },
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
                      categories: { type: "array", items: { type: "string" }, description: "nudity, violence, hate, profanity, drugs, sexual, gore, extremism, inappropriate_meme" },
                      details: { type: "string" },
                    },
                    required: ["is_harmful", "severity", "categories", "details"],
                    additionalProperties: false,
                  },
                  should_block: { type: "boolean", description: "true if content should be blocked" },
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
      let errorMsg = "AI tahlil qilishda xatolik yuz berdi.";
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
