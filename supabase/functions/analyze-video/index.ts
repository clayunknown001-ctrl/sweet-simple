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
            content: `You are an EXTREMELY STRICT content moderation AI for a safe browser. Your job is to protect users from ALL inappropriate video content.

Analyze the given video and return structured results. ALL text fields MUST be in ${responseLang}.

BLOCKING CRITERIA — Flag and block (should_block: true) if ANY of these are present in ANY frame:
1. NUDITY & SEXUAL CONTENT:
   - Full or partial nudity in any scene
   - Semi-nudity: bikinis, swimsuits, lingerie, underwear, crop tops, deep cleavage, very short clothing
   - Sexually suggestive movements: twerking, provocative dancing, seductive gestures
   - Tight/revealing clothing emphasizing body curves
   - Any scene clearly designed to be sexually attractive or arousing
   - Romantic/intimate scenes with physical contact beyond a brief hug
2. VIOLENCE & GORE: Blood, wounds, fighting, weapons, torture, dead bodies
3. HATE & EXTREMISM: Hate symbols, racist content, extremist propaganda
4. DRUGS: Drug use, paraphernalia, promotion
5. OFFENSIVE LANGUAGE: Profanity, slurs, hate speech, threats in ANY language (spoken or text)
6. DISTURBING: Horror, shock, self-harm

IMPORTANT: Be EXTREMELY strict. If ANY frame shows revealing, tight, or suggestive content — BLOCK the entire video.
When in doubt — BLOCK IT. Safety is the top priority.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this video for content moderation." },
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
              description: "Return video analysis with content moderation",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string", description: "Detailed description (3-5 sentences)" },
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        timestamp: { type: "string" },
                        description: { type: "string" },
                      },
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
                      categories: { type: "array", items: { type: "string" }, description: "nudity, violence, hate, profanity, drugs, sexual, gore, extremism" },
                      details: { type: "string" },
                    },
                    required: ["is_harmful", "severity", "categories", "details"],
                    additionalProperties: false,
                  },
                  should_block: { type: "boolean", description: "true if content should be blocked" },
                  block_reason: { type: "string", description: "Reason for blocking, empty if safe" },
                },
                required: ["description", "scenes", "objects", "actions", "mood", "category", "contains_speech", "speech_summary", "contains_people", "estimated_people_count", "tags", "quality", "harmful_content", "should_block", "block_reason"],
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
