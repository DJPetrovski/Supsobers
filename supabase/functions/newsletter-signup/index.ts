// Supabase Edge Function: newsletter-signup
// Adds an email address to the Kit list. Kit's own form blocks plain posts from other sites (it wants a captcha),
// so the site calls this function and the function talks to Kit's API.
// Secrets: KIT_API_KEY (your Kit API key). Optional: KIT_FORM_ID (default 10131448).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const KEY = Deno.env.get("KIT_API_KEY") || "", FORM = Deno.env.get("KIT_FORM_ID") || "10131448";
const H = { "X-Kit-Api-Key": KEY, "Content-Type": "application/json", Accept: "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "post only" }, 405);
  if (!KEY) return json({ ok: false, error: "KIT_API_KEY is not set" }, 500);
  let body: any = {}; try { body = await req.json(); } catch (_) {}
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) || email.length > 120) return json({ ok: false, error: "bad email" }, 400);
  const a = await fetch("https://api.kit.com/v4/subscribers", { method: "POST", headers: H, body: JSON.stringify({ email_address: email }) });
  const ad = await a.json().catch(() => ({}));
  const id = ad?.subscriber?.id;
  if (!a.ok || !id) return json({ ok: false, error: "kit subscriber", status: a.status, detail: ad }, 502);
  const f = await fetch(`https://api.kit.com/v4/forms/${FORM}/subscribers/${id}`, { method: "POST", headers: H, body: "{}" });
  if (!f.ok) return json({ ok: false, error: "kit form", status: f.status, detail: await f.text() }, 502);
  return json({ ok: true });
});
