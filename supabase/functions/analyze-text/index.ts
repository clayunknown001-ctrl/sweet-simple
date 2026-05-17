import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  callOpenAIStyleToolCall,
  openRouterHeaders,
  parseOrder,
} from "../_shared/openai_tool.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const reasoningLayer = `
## NEUROPSYCHOLOGICAL REASONING (apply silently per text):
A. DOPAMINE LOOP (Kühn & Gallinat 2014): arousal-engineered text → reward rewiring.
B. PREFRONTAL HIJACK (Love et al 2016): lust/rage/fear-bait shuts down judgment.
C. ALGORITHMIC EXPLOITATION: clickbait, ragebait, thirst-text designed for engagement, not user.
D. EVOLUTIONARY: "natural" emotion ≠ "harmless". Don't conflate.

## SAFE CONTEXTS (DEFAULT APPROVE — avoid false positives):
- Normal conversation, greetings, questions, small talk
- News, education, science, tech, business, finance, sports
- Cooking, travel, hobbies, product descriptions
- Code, documentation, tutorials, How-tos
- Family/work/commerce communication
- Mention of body parts in MEDICAL/EDUCATIONAL context (anatomy, health)
- Mention of violence in NEWS/HISTORY context (reporting ≠ glorifying)
- Mild romance (handholding, "I love you", wedding) is NOT sexual
- Strong opinions, debate, criticism are NOT hate speech
- Slang/casual language is NOT profanity unless actually vulgar

## DECISION FRAMEWORK (per text):
1. What does the text literally say? Identify topic and register.
2. Is it engineered to provoke arousal/rage/fear, or is it informational/conversational?
3. Would a reasonable adult find this hijacks their prefrontal cortex?
4. YES with strong evidence → BLOCK; otherwise → APPROVE.
`;

function buildSystemPrompt(responseLang: string) {
  return `You are a calibrated text content moderator for a real-time content radar.
Your job: protect users from arousal-engineered, hateful, or harmful text — WITHOUT over-blocking normal content.

ALL text fields (summary, block_reason, details) MUST be in ${responseLang}.

${reasoningLayer}

## BLOCK ONLY IF (confidence > 0.70):

### EXPLICIT SEXUAL CONTENT
- Graphic descriptions of sex acts, body parts in sexual framing
- Erotica, sexting, dating-app sexual messages
- Thirst-trap captions, sexual roleplay
- DO NOT block: mild romance, "love", "kiss", educational anatomy

### VULGAR PROFANITY (actual swears, not slang)
- Real f-words, c-words, severe slurs in any language
- DO NOT block: "damn", "hell", casual exclamations, mild slang

### HATE SPEECH
- Slurs targeting race, religion, gender, orientation
- Dehumanizing language, calls for violence against groups
- DO NOT block: criticism of ideas/policies/governments

### THREATS & VIOLENCE GLORIFICATION
- Direct threats, instructions for harm, gore-glorification
- DO NOT block: news reporting, history, fiction analysis

### SELF-HARM PROMOTION
- Encouragement of suicide, self-harm methods
- DO NOT block: mental health discussion, support resources

### SCAMS / PHISHING
- Clear fraud attempts, fake giveaways, credential theft

### DRUG PROMOTION (not mention)
- Instructions for drug preparation, encouragement of use
- DO NOT block: news, medical, harm reduction info

## CALIBRATION RULES (CRITICAL):
- Default: APPROVE. Most text is normal.
- Confidence > 0.70 required to block.
- Mild/ambiguous → APPROVE (set should_block=false, confidence reflects doubt).
- Single bad word in otherwise normal text → APPROVE unless severe slur.
- Length matters: short normal text ("hello", "thanks", "what time?") = ALWAYS APPROVE.
- When unsure between mild and harmful → APPROVE.

Return confidence between 0 and 1. Block ONLY if confidence > 0.70.`;
}

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

    // Trivial-text fast path: very short, plain text → never block (saves credits + zero false positives)
    const trimmed = text.trim();
    if (trimmed.length <= 3) {
      return new Response(JSON.stringify({
        summary: "Trivial text — auto-approved",
        language,
        sentiment: "neutral",
        sentiment_score: 0,
        topics: [],
        word_count: trimmed.split(/\s+/).filter(Boolean).length,
        reading_time_minutes: 0,
        content_type: "trivial",
        tone: "neutral",
        key_entities: [],
        harmful_content: { is_harmful: false, severity: "none", categories: [], details: "", flagged_phrases: [] },
        should_block: false,
        block_reason: "",
        confidence: 1,
        _fast_path: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const langMap: Record<string, string> = {
      en: "English",
      uz: "O'zbek tilida (Uzbek)",
      ru: "Русский (Russian)",
    };
    const responseLang = langMap[language] || "English";

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const hasAny = !!(GROQ_API_KEY || OPENROUTER_API_KEY || GEMINI_API_KEY || LOVABLE_API_KEY);
    if (!hasAny) throw new Error("No AI provider configured");

    const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile";
    const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") || "openai/gpt-4o-mini";

    const systemPrompt = buildSystemPrompt(responseLang);
    const schema = {
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
        },
        should_block: { type: "boolean" },
        block_reason: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["summary", "language", "sentiment", "sentiment_score", "topics", "word_count", "reading_time_minutes", "content_type", "tone", "key_entities", "harmful_content", "should_block", "block_reason", "confidence"],
    };

    async function callGoogle() {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text }] }],
          tools: [{ functionDeclarations: [{ name: "return_analysis", description: "Return moderation", parameters: schema }] }],
          toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["return_analysis"] } },
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        const e: any = new Error(`Google ${r.status}: ${t}`); e.status = r.status; throw e;
      }
      const d = await r.json();
      const parts = d?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) if (p.functionCall?.args) return p.functionCall.args;
      throw new Error("Google: no function call");
    }

    async function callGroq() {
      const { args } = await callOpenAIStyleToolCall({
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: GROQ_API_KEY!,
        model: GROQ_MODEL,
        systemPrompt,
        userContent: text,
        toolName: "return_analysis",
        toolDescription: "Return calibrated text moderation decision",
        parameters: schema,
      });
      return args;
    }

    async function callOpenRouter() {
      const { args } = await callOpenAIStyleToolCall({
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: OPENROUTER_API_KEY!,
        model: OPENROUTER_MODEL,
        systemPrompt,
        userContent: text,
        toolName: "return_analysis",
        toolDescription: "Return calibrated text moderation decision",
        parameters: schema,
        extraHeaders: openRouterHeaders(),
      });
      return args;
    }

    async function callLovable() {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
          tools: [{
            type: "function",
            function: { name: "return_analysis", description: "Return calibrated text moderation decision", parameters: schema },
          }],
          tool_choice: { type: "function", function: { name: "return_analysis" } },
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        const e: any = new Error(`Lovable ${r.status}: ${t}`); e.status = r.status; throw e;
      }
      const d = await r.json();
      const tc = d.choices?.[0]?.message?.tool_calls?.[0];
      if (tc) return JSON.parse(tc.function.arguments);
      return JSON.parse(d.choices?.[0]?.message?.content);
    }

    const order = parseOrder(Deno.env.get("AI_PROVIDER_ORDER_TEXT"), ["groq", "openrouter", "gemini", "lovable"]);

    let analysis: any = null;
    let providerUsed = "none";
    let firstError: any = null;

    for (const step of order) {
      if (analysis) break;
      try {
        if (step === "groq" && GROQ_API_KEY) {
          analysis = await callGroq();
          providerUsed = "groq";
          console.log("✅ Text: Groq");
        } else if (step === "openrouter" && OPENROUTER_API_KEY) {
          analysis = await callOpenRouter();
          providerUsed = "openrouter";
          console.log("✅ Text: OpenRouter");
        } else if (step === "gemini" && GEMINI_API_KEY) {
          analysis = await callGoogle();
          providerUsed = "google-ai-studio";
          console.log("✅ Text: Google AI Studio");
        } else if (step === "lovable" && LOVABLE_API_KEY) {
          analysis = await callLovable();
          providerUsed = "lovable-gateway";
          console.log("✅ Text: Lovable Gateway");
        }
      } catch (e: any) {
        if (!firstError) firstError = e;
        console.warn(`⚠️ Text provider ${step} failed:`, e?.message?.slice?.(0, 200) ?? e);
      }
    }

    if (!analysis) {
      const msg = firstError?.message || "All AI providers failed";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conf = typeof analysis.confidence === "number" ? analysis.confidence : 0.8;
    if (analysis.should_block && conf < 0.70) {
      analysis.should_block = false;
      analysis.block_reason = "Low confidence — approved by calibration gate";
      if (analysis.harmful_content) {
        analysis.harmful_content.is_harmful = false;
        analysis.harmful_content.severity = "none";
      }
    }

    return new Response(JSON.stringify({ ...analysis, _provider: providerUsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
