import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://www.vocalink-team.com", "https://vocalink-team.github.io"]);
const text = (v: unknown, max: number) => typeof v === "string" ? v.trim().slice(0, max) : "";
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = allowedOrigins.has(origin);
  const cors: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
  if (allowedOrigin) cors["Access-Control-Allow-Origin"] = origin;
  const reply = (status: number, data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { status, headers: cors });
  if (!allowedOrigin) return reply(403, { error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return reply(503, { error: "verification_unavailable" });
  const declaredSize = Number(req.headers.get("content-length") || 0);
  if (declaredSize > 16000) return reply(413, { error: "payload_too_large" });
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 16000) return reply(413, { error: "payload_too_large" });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error("invalid");
  } catch { return reply(400, { error: "invalid_json" }); }
  const token = body.turnstile_token;
  if (typeof token !== "string" || token.length < 1 || token.length > 2048) return reply(403, { error: "verification_required" });
  const name = text(body.name, 100), email = text(body.email, 255), role = text(body.role, 100), motivation = text(body.motivation, 5000);
  if (!name || !email || !role || !motivation || body.consent !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: "invalid_application" });
  const age = body.age === null || body.age === "" || body.age === undefined ? null : Number(body.age);
  if (age !== null && (!Number.isInteger(age) || age < 1 || age > 120)) return reply(400, { error: "invalid_age" });
  let verification: { success?: boolean; action?: string; hostname?: string };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, idempotency_key: crypto.randomUUID() }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw Error("verification_failed");
    verification = await res.json();
  } catch { return reply(503, { error: "verification_unavailable" }); }
  if (verification.success !== true || verification.hostname !== new URL(origin).hostname || verification.action !== "recruit") return reply(403, { error: "verification_failed" });
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const emailBytes = new TextEncoder().encode(email.toLowerCase());
    const hashBuffer = await crypto.subtle.digest("SHA-256", emailBytes);
    const emailHash = Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: allowed, error: limitError } = await db.rpc("try_recruit_submission", { p_hash: emailHash });
    if (limitError) { console.error("rate limit unavailable", limitError.code); return reply(503, { error: "rate_limit_unavailable" }); }
    if (allowed !== true) return reply(429, { error: "rate_limit_exceeded" });
    const application = { name, email, discord: text(body.discord, 100) || null, age, role, experience: text(body.experience, 3000) || null, portfolio_url: text(body.portfolio_url, 500) || null, motivation, availability: text(body.availability, 2000) || null, consent: true };
    const { data, error } = await db.from("team_applications").insert(application).select("id,created_at,name,email,role").single();
    if (error) throw error;
    const webhook = Deno.env.get("DISCORD_APPLICATION_WEBHOOK_URL");
    if (webhook) {
      try { await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "VOCALINK-TEAM 採用通知", embeds: [{ title: "新しい応募", fields: [{ name: "氏名", value: data.name }, { name: "希望ポジション", value: data.role }, { name: "メール", value: data.email }, { name: "応募ID", value: data.id }], timestamp: data.created_at }] }), signal: AbortSignal.timeout(5000) }); } catch (e) { console.error("webhook delivery failed", e instanceof Error ? e.name : "error"); }
    }
    return reply(200, { ok: true, application_id: data.id });
  } catch (e) { console.error("application insert failed", e instanceof Error ? e.name : "error"); return reply(500, { error: "submission_failed" }); }
});

