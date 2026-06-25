// =============================================================================
// analyze-text — 100% LOCAL moderation. No external AI APIs.
// All previous Groq / OpenRouter / Gemini / Lovable Gateway calls REMOVED.
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { runGate } from "../_shared/moderation/gate.ts";
import { hashContent, getCached, setCached } from "../_shared/moderation/memory.ts";
import { buildLocalTextAnalysis } from "../_shared/moderation/local-engine.ts";
import { authenticateRequest } from "../_shared/auth.ts";

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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = text.trim();

    // Trivial-text fast path
    if (trimmed.length <= 3) {
      return new Response(JSON.stringify({
        ...buildLocalTextAnalysis(trimmed, language),
        summary: "Trivial text — auto-approved",
        _provider: "local-engine", _fast_path: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Cache short-circuit
    const contentHash = await hashContent(`text:${text}`);
    const cached = getCached(contentHash);
    if (cached) {
      return new Response(JSON.stringify({ ...cached, _provider: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysis = buildLocalTextAnalysis(text, language);
    const gated = runGate({ analysis, rawInput: text, kind: "text", contentHash });
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
    console.error("analyze-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
