import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { recordFeedback, allStats } from "../_shared/moderation/memory.ts";
import type { ContentCategory } from "../_shared/moderation/context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method === "GET") {
      return new Response(JSON.stringify({ stats: allStats() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { category, kind, note, content_hash } = body ?? {};
    if (!category || !["wrong_block", "missed_harm"].includes(kind)) {
      return new Response(JSON.stringify({ error: "category and kind required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = recordFeedback(category as ContentCategory, kind);
    console.log(`📝 Feedback: ${kind} for ${category} (${note ?? ""}) → threshold=${result.threshold.toFixed(3)} hash=${content_hash ?? "-"}`);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
