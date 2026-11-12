import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set(["https://www.vocalink-team.com", "https://vocalink-team.github.io"]);
const categories = new Set(["Webサイト制作", "Webアプリ制作", "大会管理サイト", "システム開発", "デザイン制作", "その他"]);
const limits = {
  name: 100, organization: 200, email: 320, phone: 30, contact_method: 5,
  category: 100, title: 200, description: 10000, features: 10000, reference_urls: 5000,
  deadline: 10, budget: 100, materials: 100, notes: 5000,
};
const required = ["name", "email", "contact_method", "category", "title", "description"] as const;
const maxBodyBytes = 131072;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const cors = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: cors });
  if (!origins.has(origin)) return reply(403, { error: "origin_not_allowed" });
  cors.set("Access-Control-Allow-Origin", origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  if (req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply(415, { error: "unsupported_content_type" });
  }
  if (Number(req.headers.get("Content-Length")) > maxBodyBytes) return reply(413, { error: "payload_too_large" });

  let body: Record<string, unknown>;
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: "invalid_json" });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let size = 0;
    let raw = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBodyBytes) {
          await reader.cancel();
          return reply(413, { error: "payload_too_large" });
        }
        raw += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
    body = JSON.parse(raw + decoder.decode());
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "invalid_json" });
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  if (Object.keys(body).some((key) => !Object.hasOwn(limits, key) &&
    key !== "urgent" && key !== "consent" && key !== "turnstile_token")) {
    return reply(400, { error: "unexpected_field" });
  }
  const submission: Record<string, string | boolean | null> = {};
  for (const [key, limit] of Object.entries(limits)) {
    const value = body[key];
    if (value != null && (typeof value !== "string" || value.length > limit || value.includes("\0"))) {
      return reply(400, { error: "invalid_input" });
    }
    submission[key] = typeof value === "string" ? value.trim() || null : null;
  }
  if (required.some((key) => !submission[key]) || body.consent !== true || typeof body.urgent !== "boolean" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(submission.email)) ||
    !categories.has(String(submission.category)) || !["email", "phone"].includes(String(submission.contact_method))) {
    return reply(400, { error: "invalid_input" });
  }
  if (typeof submission.deadline === "string") {
    const date = new Date(submission.deadline + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submission.deadline) || submission.deadline.startsWith("0000-") ||
      !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== submission.deadline) {
      return reply(400, { error: "invalid_input" });
    }
  }
  submission.urgent = body.urgent;
  const token = body.turnstile_token;
  if (typeof token !== "string" || !token || token.length > 2048) return reply(403, { error: "verification_required" });

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const dbUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !dbUrl || !serviceKey) return reply(503, { error: "submission_unavailable" });
  try {
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!verification.ok) return reply(503, { error: "verification_unavailable" });
    const result = await verification.json();
    if (result.success !== true || result.hostname !== new URL(origin).hostname || result.action !== "service_request") {
      return reply(403, { error: "verification_failed" });
    }
  } catch {
    return reply(503, { error: "verification_unavailable" });
  }

  try {
    const email = String(submission.email).toLowerCase();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const db = createClient(dbUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("submit_service_request", { p_email_hash: hash, p_request: submission });
    if (error || typeof data !== "boolean") {
      console.error("Service request RPC failed", error?.code);
      return reply(503, { error: "submission_unavailable" });
    }
    if (!data) return reply(429, { error: "rate_limit_exceeded" });
    return reply(201, { ok: true });
  } catch {
    return reply(503, { error: "submission_unavailable" });
  }
});
