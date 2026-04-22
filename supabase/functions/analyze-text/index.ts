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
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are the MOST STRICT content moderation AI in the world, with deep understanding of human neuropsychology. You protect users — especially young people — from ALL inappropriate, harmful, and morally corrupting text content on the internet.

Your task: Analyze the text and determine if it should be BLOCKED or APPROVED.

ALL text fields in your response MUST be in ${responseLang}.

## BEHAVIORAL REASONING LAYER (How Human Feelings Work)
Based on peer-reviewed research (Kühn & Gallinat 2014, Love et al. 2016, PMC7328032, Darwin's emotion theory):

1. DOPAMINE & REWARD: Sexually-charged or emotionally-manipulative text triggers dopamine. Repeated exposure rewires reward pathways → addiction-like patterns.
2. PREFRONTAL HIJACK: Lust, rage, fear shut down rational judgment. Text engineered to provoke these emotions hijacks user's free will.
3. DESENSITIZATION: Repeated exposure to objectifying or harmful text normalizes it — damaging empathy, relationships, self-image.
4. EVOLUTIONARY SIGNALS: Emotions evolved as survival signals. Modern content WEAPONIZES lust, outrage, and fear to capture attention.
5. COMPULSION LOOPS: Even single exposure can trigger craving cycles in vulnerable users.

REASONING for EVERY text:
Step 1: What does the text literally say?
Step 2: What EMOTION is it engineered to provoke? (lust, rage, fear, curiosity, calm, joy)
Step 3: Does this emotion serve the user's wellbeing or hijack their brain?
Step 4: Decide — APPROVE only if it clearly serves user wellbeing.

## ABSOLUTE BLOCKING CRITERIA — Block (should_block: true) if ANY of the following:

### 1. PROFANITY & VULGAR LANGUAGE (ZERO TOLERANCE)
- ANY swear words in ANY language (English, Russian, Uzbek, Turkish, Arabic, Spanish, etc.)
- Vulgar slang, crude expressions
- Masked/censored profanity (f***, sh**, etc.)
- Internet slang for profanity

### 2. SEXUAL CONTENT (ZERO TOLERANCE)
- ANY sexually suggestive text, even mildly flirtatious
- Sexual descriptions, innuendo, double meanings
- Romantic/erotic content, love scenes
- Dating app style messages with sexual undertones
- References to sexual acts, body parts in sexual context
- "Sexy", "hot" used to describe people
- Text engineered to provoke arousal/lust (Step-2 emotion = lust → BLOCK)

### 3. HATE SPEECH & DISCRIMINATION
- Racism, xenophobia, homophobia, sexism
- Slurs targeting any group
- Dehumanizing language
- Bullying, harassment, intimidation

### 4. VIOLENCE & THREATS
- Threats of violence or harm
- Glorification of violence
- Detailed descriptions of violent acts
- Encouragement of self-harm or suicide

### 5. DRUGS & SUBSTANCE ABUSE
- References to drug use or promotion
- Alcohol glorification
- Instructions for drug preparation

### 6. SCAMS & DECEPTION
- Phishing attempts
- Fraudulent content
- Misleading health/financial claims

### 7. CODED LANGUAGE & BYPASS ATTEMPTS
- Slang or coded words used to bypass filters
- Leetspeak profanity (pr0n, b00bs, etc.)
- Abbreviations for inappropriate terms
- Emoji combinations with sexual/drug meanings

## DECISION RULE:
- Apply the 4-step reasoning before every decision
- If text is engineered to hijack the user's brain (lust, rage, fear-bait) → BLOCK
- If there is even a 10% chance the text is inappropriate → BLOCK IT
- When in doubt → ALWAYS BLOCK
- Only mark safe if the text serves user wellbeing (educational, informational, family-friendly)`,
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
                  harmful_content: {
                    type: "object",
                    properties: {
                      is_harmful: { type: "boolean" },
                      severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
                      categories: { type: "array", items: { type: "string" } },
                      details: { type: "string" },
                      flagged_phrases: { type: "array", items: { type: "string" } },
                    },
                    required: ["is_harmful", "severity", "categories", "details", "flagged_phrases"],
                    additionalProperties: false,
                  },
                  should_block: { type: "boolean", description: "true if content should be blocked — be EXTREMELY strict" },
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
