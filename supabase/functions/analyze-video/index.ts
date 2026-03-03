import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_base64, mime_type = "video/mp4", language = "en" } = await req.json();
    if (!video_base64) {
      return new Response(JSON.stringify({ error: "video_base64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const langMap: Record<string, string> = {
      en: "English",
      uz: "O'zbek tilida (Uzbek)",
      ru: "Русский (Russian)",
    };
    const responseLang = langMap[language] || "English";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a video analysis AI with a CRITICAL focus on detecting harmful content (pornography, nudity, violence, hate, drugs, offensive language/text, inappropriate gestures, etc.).

Analyze the given video and return structured results. ALL text fields MUST be in ${responseLang}.
Be thorough in harmful content detection - check every scene for inappropriate content and any bad words in speech or visible text.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this video in detail." },
              {
                type: "image_url",
                image_url: { url: `data:${mime_type};base64,${video_base64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_video_analysis",
              description: "Return the video analysis results",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string", description: "Detailed description of the video content (3-5 sentences)" },
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        timestamp: { type: "string", description: "Approximate timestamp or range" },
                        description: { type: "string", description: "What happens in this scene" },
                      },
                      required: ["timestamp", "description"],
                      additionalProperties: false,
                    },
                    description: "Key scenes/moments in the video",
                  },
                  objects: { type: "array", items: { type: "string" }, description: "Objects detected" },
                  actions: { type: "array", items: { type: "string" }, description: "Actions/activities happening" },
                  mood: { type: "string", description: "Overall mood/atmosphere" },
                  category: { type: "string", description: "Video category (e.g. tutorial, vlog, nature, sports)" },
                  contains_speech: { type: "boolean" },
                  speech_summary: { type: "string", description: "Summary of speech if any, empty if none" },
                  contains_people: { type: "boolean" },
                  estimated_people_count: { type: "number" },
                  tags: { type: "array", items: { type: "string" }, description: "5-8 relevant tags" },
                  quality: { type: "string", enum: ["low", "medium", "high"] },
                  harmful_content: {
                    type: "object",
                    properties: {
                      is_harmful: { type: "boolean", description: "Whether any harmful/inappropriate content was detected" },
                      severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
                      categories: { type: "array", items: { type: "string" }, description: "Categories: nudity, violence, hate, profanity, drugs, etc." },
                      details: { type: "string", description: "Detailed explanation" },
                    },
                    required: ["is_harmful", "severity", "categories", "details"],
                    additionalProperties: false,
                  },
                },
                required: ["description", "scenes", "objects", "actions", "mood", "category", "contains_speech", "speech_summary", "contains_people", "estimated_people_count", "tags", "quality", "harmful_content"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_video_analysis" } },
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
      let errorMsg = "Video tahlil qilishda xatolik yuz berdi.";
      try {
        const errData = JSON.parse(t);
        if (errData?.error?.message) errorMsg = errData.error.message;
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
    console.error("analyze-video error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
