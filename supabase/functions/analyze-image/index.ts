// Supabase Edge Function: analyze-image
// Bu faylni: supabase/functions/analyze-image/index.ts ga qo'ying

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ========== GEMINI PROMPT (YOUTH PROTECTION) ==========
const YOUTH_PROTECTION_PROMPT = `You are a strict content safety filter for a web browser used exclusively by children under 13 years old.

Analyze the provided image and return {"should_block": true} if the image shows ANY of the following:
- A person wearing a bikini, swimsuit, or bathing suit
- Significant exposed skin: bare midriff, cleavage, bare thighs, or buttocks
- Lingerie, underwear, or sleepwear being worn
- A person in a suggestive, sexualized, or provocative pose
- Tight/revealing clothing that exposes the body in a sexual way
- Music video thumbnails with dancers or performers in revealing outfits
- Romantic or sexual activity between people
- Shirtless men or women posed in a sexualized way
- Any content a primary school (K-6) teacher would consider inappropriate
- Partial nudity, even if artistic or non-explicit

Return {"should_block": false} ONLY for clearly safe content such as:
- Sports action shots where players wear standard uniforms (football, basketball, tennis, etc.)
- News, documentary, or educational images
- Food, nature, landscapes, buildings, or objects
- People wearing regular everyday street clothing (fully covered)
- Children's cartoons or animations (non-sexualized)
- Professional or business settings
- Historical or scientific educational content

CRITICAL RULES:
1. When uncertain, ALWAYS return {"should_block": true}
2. Do NOT consider whether content is "mainstream" or "commercially published" — a bikini is a bikini regardless of whether it appears in a music video
3. This filter protects real children. False positives (over-blocking) are acceptable. False negatives (missing harmful content) are NOT acceptable.

Respond ONLY with valid JSON. No explanation, no markdown, no extra text.
Examples: {"should_block": true} or {"should_block": false}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { image_url, image_base64, fast, language, youth_protection } = body;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Gemini API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Har doim youth_protection prompt ishlatiladi (bu faqat bolalar brauzeri)
    const systemPrompt = YOUTH_PROTECTION_PROMPT;

    // Gemini model tanlash: fast=true bo'lsa flash, aks holda pro
    const model = fast ? "gemini-1.5-flash" : "gemini-1.5-pro";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    // Rasm qismini tayyorlash
    let imagePart;
    if (image_base64) {
      // Base64 rasm
      const mediaType = image_base64.startsWith("/9j/") ? "image/jpeg" : "image/png";
      imagePart = {
        inlineData: {
          mimeType: mediaType,
          data: image_base64,
        },
      };
    } else if (image_url) {
      // URL orqali rasm
      try {
        const imgResp = await fetch(image_url, {
          headers: { "User-Agent": "Mozilla/5.0 SafeNet-Filter/1.0" },
        });
        if (!imgResp.ok) throw new Error(`Image fetch failed: ${imgResp.status}`);
        const imgBuffer = await imgResp.arrayBuffer();
        const imgBytes = new Uint8Array(imgBuffer);
        // base64 ga convert
        let binary = "";
        for (let i = 0; i < imgBytes.byteLength; i++) {
          binary += String.fromCharCode(imgBytes[i]);
        }
        const base64Data = btoa(binary);
        const contentType = imgResp.headers.get("content-type") || "image/jpeg";
        imagePart = {
          inlineData: {
            mimeType: contentType.split(";")[0],
            data: base64Data,
          },
        };
      } catch {
        // URL fetch muvaffaqiyatsiz bo'lsa — URL ni to'g'ridan-to'g'ri Gemini ga ber
        imagePart = {
          fileData: {
            mimeType: "image/jpeg",
            fileUri: image_url,
          },
        };
      }
    } else {
      return new Response(JSON.stringify({ should_block: false, error: "No image provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiBody = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            imagePart,
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 50,
        responseMimeType: "application/json",
      },
    };

    const geminiResp = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (geminiResp.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error("Gemini error:", errText);
      return new Response(JSON.stringify({ should_block: false, error: "Gemini API error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResp.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let result = { should_block: false };
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      // Agar JSON parse muvaffaqiyatsiz bo'lsa va "true" so'zi bo'lsa — block
      if (rawText.toLowerCase().includes("true")) {
        result = { should_block: true };
      }
    }

    return new Response(
      JSON.stringify({
        should_block: !!result.should_block,
        block_reason: result.should_block ? (result.reason || "Youth protection filter") : "",
        category: result.category || "",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ should_block: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
