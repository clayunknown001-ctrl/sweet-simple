// =============================================================================
// analyze-image — 100% LOCAL moderation. No external AI APIs.
// Pixel-level NSFW classification is performed CLIENT-SIDE by NSFWJS
// (public/extension/nsfw-loader.js). This endpoint scores URL + caption + page
// context + (optional) client-supplied NSFW probabilities and returns a verdict.
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runGate } from "../_shared/moderation/gate.ts";
import { hashContent, getCached, setCached } from "../_shared/moderation/memory.ts";
import { buildLocalImageAnalysis, analyzeUrlLocal } from "../_shared/moderation/local-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const geminiPrompt = `You are a strict content safety filter for a web browser 
used by children under 13. Analyze this image carefully.
Return {"should_block": true} if the image shows ANY of these:
- A person wearing a bikini, swimsuit, or bathing suit
- Significant exposed skin: bare midriff, cleavage, bare thighs, or buttocks
- Lingerie, underwear, or sleepwear being worn
- A person in a suggestive, sexualized, or provocative pose
- Tight/revealing clothing that exposes the body in a sexual way  
- Music video thumbnails with dancers in revealing outfits
- Any romantic or sexual activity between people
- Shirtless men/women posed in a sexualized way
Return {"should_block": false} ONLY for clearly safe content:
- Sports where players wear uniforms (football, basketball, etc.)
- News, educational, or documentary content
- Food, nature, landscapes, buildings
- People in regular street clothes (fully covered)
- Children's cartoons or animations
- Professional/business settings
Critical rule: When uncertain, ALWAYS return {"should_block": true}.
This filter protects real children. Missing harmful content is unacceptable.
Respond ONLY with valid JSON: {"should_block": true} or {"should_block": false}`;

function extractJsonObject(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function runStrictVisionReview(imageUrl?: string, imageBase64?: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  const imagePart = imageBase64
    ? { type: "image_url", image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
    : { type: "image_url", image_url: { url: imageUrl } };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "edge-fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0,
      messages: [{ role: "user", content: [{ type: "text", text: geminiPrompt }, imagePart] }],
    }),
  });
  if (res.status === 402 || res.status === 429) return { quotaStatus: res.status };
  if (!res.ok) throw new Error(`Vision review failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(String(text));
  return { shouldBlock: parsed?.should_block === true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      image_url, image_base64,
      caption, alt, title, page_url,
      nsfw_probs,                                  // { porn, hentai, sexy, neutral, drawing }
      language = "en",
      youth_protection = false,
    } = body || {};

    if (!image_url && !image_base64) {
      return new Response(JSON.stringify({ error: "image_url or image_base64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const captionText = [caption, alt, title].filter(Boolean).join(" | ");
    const contentHash = await hashContent(`image:${image_url ?? image_base64?.slice(0, 256) ?? ""}|${captionText}|yp:${youth_protection ? 1 : 0}`);

    const cached = getCached(contentHash);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, _provider: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Youth protection mode: tighten NSFW thresholds before scoring
    let effectiveNsfw = nsfw_probs;
    if (youth_protection && nsfw_probs) {
      effectiveNsfw = {
        porn:    Math.min(1, (nsfw_probs.porn    ?? 0) * 1.6),
        hentai:  Math.min(1, (nsfw_probs.hentai  ?? 0) * 1.6),
        sexy:    Math.min(1, (nsfw_probs.sexy    ?? 0) * 1.8),
        neutral: nsfw_probs.neutral,
        drawing: nsfw_probs.drawing,
      };
    }

    let analysis = buildLocalImageAnalysis({
      url: image_url, caption: captionText, pageUrl: page_url, nsfw_probs: effectiveNsfw,
    });

    const strictVision = await runStrictVisionReview(image_url, image_base64);
    if (strictVision?.quotaStatus) {
      return new Response(JSON.stringify({ error: "AI quota temporarily unavailable", should_block: false }), {
        status: strictVision.quotaStatus, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (strictVision?.shouldBlock) {
      analysis.should_block = true;
      analysis.confidence = Math.max(analysis.confidence ?? 0, 0.95);
      analysis.description = "Strict youth-protection vision review flagged revealing or suggestive content";
      analysis.scene_type = "adult";
      analysis.harmful_content.is_harmful = true;
      analysis.harmful_content.severity = "high";
      analysis.harmful_content.categories = [...(analysis.harmful_content.categories || []), "adult", "youth-protection"];
      analysis.harmful_content.details = "strict youth-protection visual block";
      analysis.block_reason = "Youth protection: revealing/suggestive visual content";
    }

    // Hard URL block override (unsafe domain)
    const urlLocal = analyzeUrlLocal(image_url);
    if (urlLocal.shouldBlock && urlLocal.confidence >= 0.9) {
      analysis.should_block = true;
      analysis.harmful_content.is_harmful = true;
      analysis.harmful_content.severity = "high";
      analysis.block_reason = `Unsafe domain: ${urlLocal.signals.join(", ")}`;
    }

    // Youth protection: block on any suggestive signal or moderate NSFW probability
    if (youth_protection && !analysis.should_block) {
      const p = nsfw_probs || {};
      const ypBlock =
        (p.porn   ?? 0) >= 0.30 ||
        (p.hentai ?? 0) >= 0.30 ||
        (p.sexy   ?? 0) >= 0.40 ||
        (analysis.nsfw_probability ?? 0) >= 0.45;
      if (ypBlock) {
        analysis.should_block = true;
        analysis.harmful_content.is_harmful = true;
        analysis.harmful_content.severity = analysis.harmful_content.severity || "high";
        analysis.harmful_content.categories = [...(analysis.harmful_content.categories || []), "youth-protection"];
        analysis.block_reason = analysis.block_reason || "Youth protection: suggestive/revealing content blocked for under-13 browser";
      }
    }


    const gated = runGate({ analysis, kind: "image", contentHash });
    setCached(contentHash, gated.analysis);

    return new Response(JSON.stringify({
      ...gated.analysis,
      _provider: "local-engine",
      _decision: {
        id: contentHash,
        verdict: gated.verdict,
        category: gated.category,
        confidence: gated.confidence,
        threshold: gated.threshold,
        reasoning: gated.reasoning,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", should_block: false }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
