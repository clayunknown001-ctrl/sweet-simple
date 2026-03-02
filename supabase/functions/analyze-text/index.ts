import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
            content: `You are a content analysis AI. Analyze the given text and return a JSON response with these fields:
- summary: A brief 2-3 sentence summary
- language: The detected language name
- sentiment: One of "positive", "negative", "neutral", "mixed"
- sentiment_score: A number from -1 (very negative) to 1 (very positive)
- topics: Array of 3-5 main topics/keywords
- word_count: Number of words
- reading_time_minutes: Estimated reading time
- content_type: Type of content (article, review, social_post, technical, creative, etc.)
- tone: The writing tone (formal, informal, academic, conversational, etc.)
- key_entities: Array of named entities found (people, places, organizations)

Return ONLY valid JSON, no markdown.`,
          },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return the text analysis results",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  language: { type: "string" },
                  sentiment: { type: "string", enum: ["positive", "negative", "neutral", "mixed"] },
                  sentiment_score: { type: "number" },
                  topics: { type: "array", items: { type: "string" } },
                  word_count: { type: "number" },
                  reading_time_minutes: { type: "number" },
                  content_type: { type: "string" },
                  tone: { type: "string" },
                  key_entities: { type: "array", items: { type: "string" } },
                },
                required: ["summary", "language", "sentiment", "sentiment_score", "topics", "word_count", "reading_time_minutes", "content_type", "tone", "key_entities"],
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
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const analysis = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(analysis), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try parsing content directly
    const content = data.choices?.[0]?.message?.content;
    return new Response(JSON.stringify(JSON.parse(content)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
