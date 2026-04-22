import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { video_base64, mime_type = "video/mp4", language = "en", fast = false } = await req.json();
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

    // FAST = real-time scroll monitoring (browser), FULL = batafsil tahlil
    const model = fast ? "google/gemini-2.5-flash" : "google/gemini-2.5-pro";

    // BEHAVIORAL REASONING LAYER — peer-reviewed neuroscience of arousal & attention hijacking
    const reasoningLayer = `
## BEHAVIORAL REASONING LAYER (Neuroscience of Feelings):
REASON like a neuroscientist before deciding:

1. DOPAMINE LOOP (Kühn & Gallinat 2014, PMC3896127):
   Video is MORE addictive than images — motion + sound + novelty = max dopamine hit.
   Repeated arousal-video exposure shrinks striatum → user needs harder content over time.
   → Block ANY video engineered to spike arousal.

2. PREFRONTAL SHUTDOWN (PMC7328032):
   Arousing motion (dance, body emphasis, slow-motion skin) hijacks judgment circuits.
   User cannot "choose" to look away once dopamine fires.
   → You must BLOCK before the user's brain is hijacked.

3. ALGORITHMIC WEAPONIZATION (Effects of Pornography research):
   Social media algorithms surface sexually-suggestive video because it maximizes watch-time.
   This is NOT user choice — it's exploitation of primal drives.
   → Your role: counter-algorithm protecting user wellbeing.

4. COMPULSION & DESENSITIZATION (Love et al. 2016):
   Even 3 seconds of suggestive video can trigger craving cycles.
   ANY single arousing frame = entire video must be blocked.

5. EVOLUTIONARY SIGNAL (Darwin):
   Lust ≠ love ≠ wellbeing. Lust is a reproductive drive being exploited.
   Protect the user from manipulation of their own biology.

REASONING PROCESS for EVERY video:
Step 1: What happens across frames? (motion, bodies, clothing, context, sound cues)
Step 2: What EMOTION is engineered? (lust, fear, awe, calm, curiosity, joy)
Step 3: Does it serve user wellbeing or hijack their reward circuit?
Step 4: Decide — APPROVE only if it clearly serves user. BLOCK if any doubt.
`;

    const systemPrompt = fast
      ? `You are a real-time video moderator (radar-style — always watching, instant decision) with neuropsychology expertise.
Response in ${responseLang}.
${reasoningLayer}

BLOCK (should_block: true) if ANY frame contains:
- Nudity, bikinis, lingerie, underwear, shirtless bodies
- Suggestive poses/movements, intimate touching, kissing, bed scenes
- Tight/sheer revealing clothing, cleavage, midriff, exposed thighs
- Sexual dance: twerking, grinding, provocative movement, slow-motion body emphasis
- "Aesthetic" thirst-trap reels (gaze + lips + body framing engineered for arousal)
- Violence, blood, weapons, fighting, gore
- Drugs, paraphernalia, glamorized smoking
- Hate symbols, offensive content
- Horror, self-harm, disturbing imagery
- Sexual/profane text on screen

SAFE only: nature, food, animals (unharmed), objects, architecture, tech, fully-clothed non-suggestive people, education, tutorials (non-sexual).

If Step-2 emotion = lust/craving/disturbance → BLOCK. 1% doubt = BLOCK. ANY single bad frame = BLOCK entire video.`
      : `MOST EXTREME video moderator with neuropsychological reasoning. Response in ${responseLang}.
${reasoningLayer}

BLOCK if ANY frame: nudity, bikinis, suggestive content, intimate contact, sexual dance, violence, blood, drugs, hate, disturbing, or arousal-engineered framing.
SAFE only: nature, food, animals, objects, architecture, tech, fully-clothed non-suggestive content in wholesome contexts.
Apply 4-step reasoning. 1% doubt = BLOCK.`;

    const fastParams = {
      type: "object",
      properties: {
        should_block: { type: "boolean" },
        block_reason: { type: "string" },
        confidence: { type: "number" },
        category: { type: "string" },
      },
      required: ["should_block", "block_reason", "confidence", "category"],
      additionalProperties: false,
    };

    const fullParams = {
      type: "object",
      properties: {
        description: { type: "string" },
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
            categories: { type: "array", items: { type: "string" } },
            details: { type: "string" },
          },
          required: ["is_harmful", "severity", "categories", "details"],
          additionalProperties: false,
        },
        should_block: { type: "boolean" },
        block_reason: { type: "string" },
      },
      required: ["description", "scenes", "objects", "actions", "mood", "category", "contains_speech", "speech_summary", "contains_people", "estimated_people_count", "tags", "quality", "harmful_content", "should_block", "block_reason"],
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
              { type: "text", text: fast ? "Quickly judge every frame: BLOCK or SAFE?" : "Analyze this video. Check EVERY frame. Be EXTREMELY strict." },
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
              description: "Return video moderation decision",
              parameters: fast ? fastParams : fullParams,
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
