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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      image_url, image_base64,
      caption, alt, title, page_url,
      nsfw_probs,                                  // { porn, hentai, sexy, neutral, drawing }
      language = "en",
    } = body || {};

    if (!image_url && !image_base64) {
      return new Response(JSON.stringify({ error: "image_url or image_base64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const captionText = [caption, alt, title].filter(Boolean).join(" | ");
    const contentHash = await hashContent(`image:${image_url ?? image_base64?.slice(0, 256) ?? ""}|${captionText}`);

    const cached = getCached(contentHash);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, _provider: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let analysis = buildLocalImageAnalysis({
      url: image_url, caption: captionText, pageUrl: page_url, nsfw_probs,
    });

    // Hard URL block override (unsafe domain)
    const urlLocal = analyzeUrlLocal(image_url);
    if (urlLocal.shouldBlock && urlLocal.confidence >= 0.9) {
      analysis.should_block = true;
      analysis.harmful_content.is_harmful = true;
      analysis.harmful_content.severity = "high";
      analysis.block_reason = `Unsafe domain: ${urlLocal.signals.join(", ")}`;
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
