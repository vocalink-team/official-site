import { createClient } from "npm:@supabase/supabase-js@2";

type AuthorizationFailure = { status: number; error: string };

export async function requireActiveSecurityAdmin(req: Request): Promise<AuthorizationFailure | null> {
  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { status: 401, error: "Unauthorized" };

  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publicKey || !serviceKey) {
    return { status: 500, error: "Supabase service configuration missing" };
  }

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const authClient = createClient(url, publicKey, options);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return { status: 401, error: "Unauthorized" };

  const db = createClient(url, serviceKey, options);
  const { data: member, error } = await db
    .from("team_members")
    .select("role_key,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return { status: 503, error: "Membership verification unavailable" };
  if (member?.status !== "active" || !["admin", "super_admin"].includes(member.role_key)) {
    return { status: 403, error: "Admin access required" };
  }
  return null;
}
