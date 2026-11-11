import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return out({ ok: true });
  if (req.method !== "POST") return out({ error: "POST required" }, 405);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return out({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !publicKey)
      return out({ error: "Supabase service configuration missing" }, 500);

    const authClient = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return out({ error: "Unauthorized" }, 401);

    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // SEC-02: authorize against current active membership, not stale Auth metadata.
    const { data: member, error: memberError } = await db
      .from("team_members")
      .select("role_key,status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) {
      console.error("SEC-02 membership lookup failed", memberError);
      return out({ error: "Membership verification unavailable" }, 503);
    }
    if (!member || member.status !== "active" ||
        !["admin", "super_admin"].includes(member.role_key))
      return out({ error: "Admin access required" }, 403);
    const { data, error } = await db.from("security_events").insert({
      event_type: "ddos",
      severity: "critical",
      ip_address: "192.0.2.1",
      path: "/__security_test__",
      method: "GET",
      user_agent: "NOVA-Security-Test",
      request_count: 999,
      details: { simulation: true, source: "admin_button", actor: user.id },
    }).select("id,created_at,event_type,severity").single();

    if (error) return out({
      error: "security_events insert failed",
      detail: error.message,
      code: error.code,
    }, 500);
    return out({ ok: true, event: data });
  } catch (error) {
    console.error("admin-security-test-v4 failed", error);
    return out({ error: "Internal server error" }, 500);
  }
});