// Public feedback ingestion endpoint for the browser extension and unauthenticated clients.
// Inserts directly via service role. Validates input shape and length.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const { email, message, source } = await req.json();
    const e = String(email ?? "").trim().toLowerCase();
    const m = String(message ?? "").trim();
    const src = String(source ?? "extension").slice(0, 32);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 255) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (m.length < 3 || m.length > 2000) {
      return new Response(JSON.stringify({ error: "Message must be 3-2000 chars" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Best-effort link to a registered profile by email (does not require auth).
    const { data: prof } = await supabase
      .from("profiles").select("id").eq("email", e).maybeSingle();

    const { error } = await supabase.from("feedback").insert({
      user_id: prof?.id ?? null,
      user_email: e,
      message: m,
      source: src,
      status: "open",
    });
    if (error) {
      console.error("submit-feedback insert error", error);
      return new Response(JSON.stringify({ error: "Insert failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
