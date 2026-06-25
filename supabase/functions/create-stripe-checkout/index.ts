// Placeholder Stripe Checkout endpoint.
// To activate live billing, enable Lovable's built-in Stripe payments
// and replace the body of `createCheckoutSession` with a real Stripe call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CheckoutBody {
  key_id: string;
  tier: "pro_monthly" | "pay_as_you_go";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as CheckoutBody;
    if (!body?.key_id || !["pro_monthly", "pay_as_you_go"].includes(body.tier)) {
      return json({ error: "Invalid payload" }, 400);
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      // Placeholder mode — let the client know Stripe must be enabled.
      return json({
        placeholder: true,
        message:
          "Stripe is not configured yet. Enable Lovable Payments to start charging real cards.",
        tier: body.tier,
        key_id: body.key_id,
        next_step:
          "Add STRIPE_SECRET_KEY (via Lovable Payments) and redeploy this function.",
      }, 200);
    }

    // ---- Real Stripe path (activates once STRIPE_SECRET_KEY is set) ----
    const price = body.tier === "pro_monthly"
      ? Deno.env.get("STRIPE_PRICE_PRO_MONTHLY")
      : Deno.env.get("STRIPE_PRICE_PAYG_METER");

    if (!price) return json({ error: "Stripe price ID not configured" }, 500);

    const params = new URLSearchParams();
    params.append("mode", body.tier === "pro_monthly" ? "subscription" : "subscription");
    params.append("line_items[0][price]", price);
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", `${req.headers.get("origin") ?? ""}/api?billing=success`);
    params.append("cancel_url", `${req.headers.get("origin") ?? ""}/api?billing=cancel`);
    params.append("customer_email", userData.user.email ?? "");
    params.append("metadata[key_id]", body.key_id);
    params.append("metadata[tier]", body.tier);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok) return json({ error: session?.error?.message ?? "Stripe error" }, 500);
    return json({ url: session.url, id: session.id }, 200);
  } catch (e) {
    console.error("create-stripe-checkout error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
