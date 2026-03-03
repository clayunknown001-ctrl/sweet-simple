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
            content: `You are an image analysis AI with a CRITICAL focus on detecting harmful content (pornography, nudity, violence, hate symbols, drugs, offensive text/words, inappropriate gestures, etc.).

Analyze the given image and return structured results. ALL text fields MUST be in ${responseLang}.

Key analysis areas:
- description: Detailed description (2-4 sentences)
- objects, colors, scene_type, mood, tags, quality, text_detected
- contains_people and estimated_people_count
- harmful_content: ALWAYS check for ANY inappropriate, NSFW, violent, hateful, or offensive content including bad words in any detected text

Be thorough in harmful content detection. Even mild inappropriate content should be flagged.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this image in detail." },
              imageContent,
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return the image analysis results",
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
                      is_harmful: { type: "boolean", description: "Whether any harmful/inappropriate content was detected" },
                      severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"], description: "Severity level" },
                      categories: { type: "array", items: { type: "string" }, description: "Categories of harmful content found (e.g. nudity, violence, hate, profanity, drugs)" },
                      details: { type: "string", description: "Detailed explanation of what was found" },
                    },
                    required: ["is_harmful", "severity", "categories", "details"],
                    additionalProperties: false,
                  },
                },
                required: ["description", "objects", "colors", "scene_type", "mood", "text_detected", "quality", "tags", "contains_people", "estimated_people_count", "harmful_content"],
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
            errorMsg = "Rasm URL ochilmadi. Iltimos, to'g'ridan-to'g'ri rasm URL manzilini kiriting (.jpg, .png, .webp).";
          } else {
            errorMsg = errData.error.message;
          }
        }
      } catch { /* ignore parse error */ }
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
