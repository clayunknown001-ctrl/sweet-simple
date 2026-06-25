// =============================================================================
// analyze-video — 100% LOCAL moderation. No external AI APIs.
// Frame-level NSFW classification is performed CLIENT-SIDE by NSFWJS
// (public/extension/nsfw-loader.js). This endpoint scores URL + title +
// description + page context + (optional) client-supplied frame signals.
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runGate } from "../_shared/moderation/gate.ts";
import { hashContent, getCached, setCached } from "../_shared/moderation/memory.ts";
import { buildLocalVideoAnalysis, analyzeUrlLocal } from "../_shared/moderation/local-engine.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      video_url, video_base64,
      title, description, page_url,
      language = "en",
    } = body || {};
    // SECURITY: Client-supplied nsfw_probs / frame_signals are NOT trusted server-side.
    // They could be forged to bypass moderation. Visual analysis stays client-side
    // for UX only; server-side decisions use only URL/title/description heuristics.

    if (!video_url && !video_base64) {
      return new Response(JSON.stringify({ error: "video_url or video_base64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentHash = await hashContent(`video:${video_url ?? video_base64?.slice(0, 256) ?? ""}|${title ?? ""}`);
    const cached = getCached(contentHash);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, _provider: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let analysis = buildLocalVideoAnalysis({
      url: video_url, title, description, pageUrl: page_url,
    });


    const urlLocal = analyzeUrlLocal(video_url);
    if (urlLocal.shouldBlock && urlLocal.confidence >= 0.9) {
      analysis.should_block = true;
      analysis.harmful_content.is_harmful = true;
      analysis.harmful_content.severity = "high";
      analysis.block_reason = `Unsafe domain: ${urlLocal.signals.join(", ")}`;
    }

    const gated = runGate({ analysis, kind: "video", contentHash });
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
    console.error("analyze-video error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
