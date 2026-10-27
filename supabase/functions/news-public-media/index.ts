// NEWS-001 public media gateway. Intentionally public; authorization is checked against published articles on EVERY request.
// The Storage bucket remains private and the service key never reaches the browser.
import { createClient } from "npm:@supabase/supabase-js@2";
const url = Deno.env.get("SUPABASE_URL");
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = url && secret ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types = new Set(["image/jpeg", "image/png", "image/webp"]);
const common = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Referrer-Policy": "no-referrer",
};
function response(body: string, status: number, extra: Record<string, string> = {}) {
  return new Response(body, { status, headers: { ...common, "Content-Type": "text/plain; charset=utf-8", ...extra } });
}
async function published(articleId: string) {
  if (!admin) return false;
  const { data, error } = await admin.from("news_articles").select("id").eq("id", articleId)
    .eq("status", "published").is("deleted_at", null)
    .lte("published_at", new Date().toISOString()).maybeSingle();
  return !error && !!data;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: common });
  if (req.method !== "GET") return response("Method not allowed", 405);
  if (!admin) return response("Unavailable", 503);
  const params = new URL(req.url).searchParams;
  const article = params.get("article");
  const id = params.get("id");
  if (article && !id && uuid.test(article)) {
    if (!(await published(article))) return response("Not found", 404);
    const { data, error } = await admin.from("news_media").select("id,mime_type")
      .eq("article_id", article).order("created_at", { ascending: true }).limit(24);
    if (error) return response("Unavailable", 503);
    return response(JSON.stringify((data || []).filter((m) => types.has(m.mime_type))), 200,
      { "Content-Type": "application/json; charset=utf-8" });
  }
  if (!id || article || !uuid.test(id)) return response("Not found", 404);
  const { data: media, error } = await admin.from("news_media")
    .select("article_id,storage_path,mime_type,size_bytes").eq("id", id).maybeSingle();
  if (error || !media || !media.article_id || !types.has(media.mime_type) ||
      media.size_bytes < 1 || media.size_bytes > 5242880 ||
      !media.storage_path.startsWith(media.article_id + "/")) return response("Not found", 404);
  if (!(await published(media.article_id))) return response("Not found", 404);
  const { data: blob, error: storageError } = await admin.storage.from("news-images").download(media.storage_path);
  if (storageError || !blob || blob.size > 5242880) return response("Not found", 404);
  return new Response(blob, { status: 200, headers: {
    ...common, "Content-Type": media.mime_type,
    "Content-Disposition": "inline",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
});
