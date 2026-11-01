// Supabase Edge Function: wagon-unlock
// Verifies a Stripe Checkout payment and hands back a restore code, or restores an earlier purchase from its code.
// Secrets (Project Settings > Edge Functions > Secrets): STRIPE_SECRET_KEY. Optional: MIN_CENTS (default 200), MAX_DEVICES (default 5).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MIN = Number(Deno.env.get("MIN_CENTS") || 300), MAXD = Number(Deno.env.get("MAX_DEVICES") || 5);

function makeCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(r, (x) => A[x % A.length]).join("");
  return "WAGON-" + s.slice(0, 4) + "-" + s.slice(4);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "post only" }, 405);
  let body: any = {}; try { body = await req.json(); } catch (_) {}

  if (body.action === "claim") {
    const sid = String(body.session_id || "");
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sid)) return json({ ok: false, error: "bad session" }, 400);
    const prev = await db.from("wagon_unlocks").select("code,uses").eq("session_id", sid).maybeSingle();
    if (prev.data) {
      if (prev.data.uses >= MAXD) return json({ ok: false, error: "This payment has been used on too many devices." }, 403);
      await db.from("wagon_unlocks").update({ uses: prev.data.uses + 1 }).eq("session_id", sid);
      return json({ ok: true, code: prev.data.code });
    }
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions/" + sid, { headers: { Authorization: "Bearer " + Deno.env.get("STRIPE_SECRET_KEY") } });
    if (!r.ok) {
      let why = ""; try { const e = await r.json(); why = (e.error && (e.error.message || e.error.code)) || ""; } catch (_) {}
      return json({ ok: false, error: "Payment not found." + (why ? " (Stripe says: " + why.slice(0, 160) + ")" : "") }, 404);
    }
    const s = await r.json();
    if (s.payment_status !== "paid") return json({ ok: false, error: "Payment is not complete yet." }, 402);
    if ((s.amount_total || 0) < MIN) return json({ ok: false, error: "Tip was under the minimum." }, 402);
    const code = makeCode();
    const ins = await db.from("wagon_unlocks").insert({ session_id: sid, code, uses: 1, amount_cents: s.amount_total || 0, live: !!s.livemode });
    if (ins.error) return json({ ok: false, error: "Could not save the unlock." }, 500);
    return json({ ok: true, code });
  }

  if (body.action === "restore") {
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^WAGON-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ ok: false, error: "That code does not look right." }, 400);
    const row = await db.from("wagon_unlocks").select("uses").eq("code", code).maybeSingle();
    if (!row.data) return json({ ok: false, error: "Code not found." }, 404);
    if (row.data.uses >= MAXD) return json({ ok: false, error: "This code has been used on too many devices." }, 403);
    await db.from("wagon_unlocks").update({ uses: row.data.uses + 1 }).eq("code", code);
    return json({ ok: true, code });
  }
  return json({ ok: false, error: "unknown action" }, 400);
});
