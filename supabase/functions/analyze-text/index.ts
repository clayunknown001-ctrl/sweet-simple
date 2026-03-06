import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, language = "en" } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Text is required" }), {
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
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an EXTREMELY STRICT content moderation AI for a safe browser. Your job is to protect users from ALL inappropriate text content.

Analyze the given text and return structured results. ALL text fields MUST be in ${responseLang}.

BLOCKING CRITERIA — Flag and block (should_block: true) if ANY of these are present:
1. PROFANITY & SLURS: Any swear words, vulgar language, slurs in ANY language (English, Russian, Uzbek, Turkish, Arabic, etc.)
2. SEXUAL CONTENT: Sexually suggestive text, flirting, sexual descriptions, romantic/erotic content, dating-related inappropriate content
3. HATE SPEECH: Racism, xenophobia, discrimination, threats, harassment, bullying
4. VIOLENCE: Threats, descriptions of violence, glorification of violence
5. DRUGS: Drug references, promotion of drug/alcohol use
6. SCAMS: Phishing, fraud, deceptive content
7. CODED LANGUAGE: Slang, coded words, abbreviations used to bypass filters

IMPORTANT: Be EXTREMELY strict. Even mild suggestive or inappropriate content must be flagged and blocked. When in doubt — BLOCK IT.`,
          },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return the text analysis results with content moderation",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "Brief 2-3 sentence summary" },
                  language: { type: "string", description: "Detected language" },
                  sentiment: { type: "string", enum: ["positive", "negative", "neutral", "mixed"] },
                  sentiment_score: { type: "number", description: "-1 to 1" },
                  topics: { type: "array", items: { type: "string" }, description: "3-5 main topics" },
                  word_count: { type: "number" },
                  reading_time_minutes: { type: "number" },
                  content_type: { type: "string" },
                  tone: { type: "string" },
                  key_entities: { type: "array", items: { type: "string" } },
                  harmful_content: {
                    type: "object",
                    properties: {
                      is_harmful: { type: "boolean", description: "Whether any harmful content was detected" },
                      severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
                      categories: { type: "array", items: { type: "string" }, description: "Categories: profanity, hate_speech, sexual, violence, threats, drugs, harassment, scam" },
                      details: { type: "string", description: "Detailed explanation of what was found" },
                      flagged_phrases: { type: "array", items: { type: "string" }, description: "Specific words/phrases that are harmful" },
                    },
                    required: ["is_harmful", "severity", "categories", "details", "flagged_phrases"],
                    additionalProperties: false,
                  },
                  should_block: { type: "boolean", description: "true if content should be blocked (harmful severity medium+)" },
                  block_reason: { type: "string", description: "Human-readable reason for blocking, empty if not blocked" },
                },
                required: ["summary", "language", "sentiment", "sentiment_score", "topics", "word_count", "reading_time_minutes", "content_type", "tone", "key_entities", "harmful_content", "should_block", "block_reason"],
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
