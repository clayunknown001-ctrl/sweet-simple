// Shared auth gate for moderation edge functions.
// Accepts either a Supabase JWT (from web app callers) or an `sk_` API key
// issued via `api_keys` (for external/extension/dev callers).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AuthResult =
  | { ok: true; kind: "jwt"; userId: string }
  | { ok: true; kind: "api_key"; keyId: string; developerId: string | null }
  | { ok: false; status: number; error: string };

export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Missing or invalid Authorization header" };
  }
  const token = header.slice(7).trim();
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token" };
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // API key path
  if (token.startsWith("sk_test_") || token.startsWith("sk_live_")) {
    const { data, error } = await admin
      .from("api_keys")
      .select("id, developer_id, status, token_quota, tokens_used")
      .eq("key_token", token)
      .maybeSingle();
    if (error || !data) return { ok: false, status: 401, error: "Invalid API key" };
    if (data.status !== "active") return { ok: false, status: 403, error: "API key inactive" };
    if (data.token_quota > 0 && data.tokens_used >= data.token_quota) {
      return { ok: false, status: 429, error: "Quota exceeded" };
    }
    return { ok: true, kind: "api_key", keyId: data.id, developerId: data.developer_id };
  }

  // JWT path
  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, kind: "jwt", userId: data.claims.sub as string };
}

export async function incrementApiKeyUsage(keyId: string, tokens: number) {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    await admin.rpc("increment_api_key_usage", { _key_id: keyId, _tokens: tokens })
      .then(() => {})
      .catch(() => {});
  } catch {
    // best-effort
  }
}
