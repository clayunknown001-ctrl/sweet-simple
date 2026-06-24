// Supabase Edge Function: analyze-image
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
- Sports action shots where players wear standard uniforms
- News, documentary, or educational images
- Food, nature, landscapes, buildings, or objects
- People wearing regular everyday street clothing (fully covered)
- Children's cartoons or animations (non-sexualized)
- Professional or business settings
- Historical or scientific educational content

CRITICAL RULES:
1. When uncertain, ALWAYS return {"should_block": true}
2. Do NOT consider whether content is "mainstream" or "commercially published"
3. This filter protects real children. False positives are acceptable. False negatives are NOT acceptable.

Respond ONLY with valid JSON. No explanation, no markdown.
Examples: {"should_block": true} or {"should_block": false}`;

// SSRF protection: block private/internal/loopback/link-local hosts
function isSafeImageUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "invalid url" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "scheme not allowed" };
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false, reason: "internal host" };
  }
  // Reject IP literals in private/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1]), parseInt(ipv4[2])];
    if (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) return { ok: false, reason: "private ip" };
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.includes(":")) {
    // Block IPv6 literals (incl. link-local/ULA); allow only hostnames
    if (host.includes(":")) return { ok: false, reason: "ipv6 literal not allowed" };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ---- AUTHENTICATION ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { image_url, image_base64, fast } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fail closed
      return new Response(JSON.stringify({ should_block: true, error: "AI gateway not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = YOUTH_PROTECTION_PROMPT;
    const model = fast ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-flash";
    const gatewayUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";

    let imageDataUrl: string;
    if (image_base64) {
      const mediaType = image_base64.startsWith("/9j/") ? "image/jpeg" : "image/png";
      imageDataUrl = `data:${mediaType};base64,${image_base64}`;
    } else if (image_url) {
      const safety = isSafeImageUrl(image_url);
      if (!safety.ok) {
        return new Response(JSON.stringify({ should_block: true, error: `Invalid image URL: ${safety.reason}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const imgResp = await fetch(image_url, {
          headers: { "User-Agent": "Mozilla/5.0 SafeNet-Filter/1.0" },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
        if (!imgResp.ok) throw new Error(`Image fetch failed: ${imgResp.status}`);
        const imgBuffer = await imgResp.arrayBuffer();
        const imgBytes = new Uint8Array(imgBuffer);
        let binary = "";
        for (let i = 0; i < imgBytes.byteLength; i++) binary += String.fromCharCode(imgBytes[i]);
        const base64Data = btoa(binary);
        const contentType = imgResp.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) {
          return new Response(JSON.stringify({ should_block: true, error: "Not an image" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        imageDataUrl = `data:${contentType.split(";")[0]};base64,${base64Data}`;
      } catch (e) {
        return new Response(JSON.stringify({ should_block: true, error: "Image fetch failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ should_block: true, error: "No image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gatewayBody = {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemPrompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 100,
    };

    const geminiResp = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify(gatewayBody),
    });

    if (geminiResp.status === 429) {
      return new Response(JSON.stringify({ should_block: true, error: "rate_limit" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error("AI gateway error:", errText);
      return new Response(JSON.stringify({ should_block: true, error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResp.json();
    const rawText = geminiData?.choices?.[0]?.message?.content || "{}";


    let result: any = { should_block: true }; // default fail-closed
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      if (rawText.toLowerCase().includes("true")) result = { should_block: true };
      else result = { should_block: true }; // fail closed
    }

    return new Response(
      JSON.stringify({
        should_block: !!result.should_block,
        block_reason: result.should_block ? (result.reason || "Youth protection filter") : "",
        category: result.category || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    // Fail closed
    return new Response(
      JSON.stringify({ should_block: true, error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
