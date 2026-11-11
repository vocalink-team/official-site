import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireActiveSecurityAdmin } from "../_shared/security-admin.ts";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return response({ error: "POST required" }, 405);
    const denial = await requireActiveSecurityAdmin(req);
    if (denial) return response({ error: denial.error }, denial.status);

    const webhook = Deno.env.get("DISCORD_SECURITY_WEBHOOK");
    if (!webhook) return response({ error: "DISCORD_SECURITY_WEBHOOK is not configured" }, 500);

    const input = await req.json();
    const event = input?.event ?? input;
    const severity = String(event?.severity ?? "medium").toLowerCase();
    const color = severity === "critical" ? 0xff3b30 : severity === "high" ? 0xff9500 : severity === "medium" ? 0xffcc00 : 0x34c759;

    const discordResponse = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "NOVA Security",
        content: "🚨 NOVA-CREATE-TEAM セキュリティアラート",
        embeds: [{
          title: `${severity.toUpperCase()} / ${event?.event_type ?? "security_alert"}`,
          color,
          fields: [
            { name: "IP", value: `\`${event?.ip_address ?? "unknown"}\``, inline: true },
            { name: "危険度", value: severity.toUpperCase(), inline: true },
            { name: "Requests", value: String(event?.request_count ?? "unknown"), inline: true },
            { name: "対象", value: `\`${event?.method ?? ""} ${event?.path ?? "unknown"}\`` },
            { name: "発生時刻", value: String(event?.created_at ?? new Date().toISOString()) }
          ],
          footer: { text: "NOVA-CREATE-TEAM Security Monitoring" }
        }]
      })
    });

    if (!discordResponse.ok) return response({ error: `Discord webhook returned ${discordResponse.status}` }, 502);
    return response({ ok: true });
  } catch {
    console.error("Discord security notification failed");
    return response({ error: "Internal server error" }, 500);
  }
});