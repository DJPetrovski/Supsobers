// Supabase Edge Function: clancy-answer
// Writes a short, cited answer to a visitor's question from passages the Clancy archive search already found.
// The browser does the searching; this function only reads the passages it is handed and asks Claude to answer from them.
// Secrets: ANTHROPIC_API_KEY (required). Optional: CLANCY_MODEL (default claude-haiku-5-5), ALLOWED_ORIGINS (comma list, default supsobers.com).
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://supsobers.com,https://www.supsobers.com").split(",").map((s) => s.trim());
const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = Deno.env.get("CLANCY_MODEL") || "claude-haiku-5-5";
const cors = (o: string) => ({
  "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const SYSTEM = `You answer questions for a research archive of Commonwealth v. Lindsay Clancy (Plymouth Superior Court, Massachusetts; mistrial Sept. 4, 2026).
You are given numbered passages: auto-captioned trial video (speakers are not labeled, the text may contain misheard words and names) and OCR text of court documents.
Rules:
- Answer ONLY from the passages. If they do not answer the question, say so plainly and say what they do cover. Never use outside knowledge or guess.
- Cite every claim with the passage number in square brackets, like [2]. Several numbers are fine: [1][3].
- Testimony is what a witness said under oath, not an established fact. Attribute it ("a witness testified...", "the warrant affidavit states..."). When witnesses disagree, say so.
- Be neutral and complete. No moralizing, no commentary, no speculation about guilt. Do not editorialize about the people involved.
- Keep it under 180 words. Plain sentences. No headings.`;
const hits: Record<string, number[]> = {};
Deno.serve(async (req) => {
  const o = req.headers.get("origin") || "";
  const C = cors(o);
  const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...C, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: C });
  if (req.method !== "POST") return out({ ok: false, error: "post only" }, 405);
  if (!KEY) return out({ ok: false, error: "ANTHROPIC_API_KEY is not set" }, 500);
  if (o && !ORIGINS.includes(o)) return out({ ok: false, error: "origin" }, 403);
  const ip = (req.headers.get("x-forwarded-for") || "x").split(",")[0].trim(), now = Date.now();
  hits[ip] = (hits[ip] || []).filter((t) => now - t < 600000);
  if (hits[ip].length >= 12) return out({ ok: false, error: "slow down" }, 429);
  hits[ip].push(now);
  let b: any = {}; try { b = await req.json(); } catch (_) {}
  const q = String(b.question || "").trim().slice(0, 300);
  const ps = (Array.isArray(b.passages) ? b.passages : []).slice(0, 10).map((p: any, i: number) => ({ n: i + 1, l: String(p.l || "").slice(0, 160), x: String(p.x || "").slice(0, 1800) })).filter((p: any) => p.x);
  if (q.length < 3 || !ps.length) return out({ ok: false, error: "bad request" }, 400);
  const content = `Question: ${q}\n\nPassages:\n` + ps.map((p: any) => `[${p.n}] (${p.l})\n${p.x}`).join("\n\n");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 500, system: SYSTEM, messages: [{ role: "user", content }] }),
  });
  const d = await r.json().catch(() => ({}));
  const text = (d?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
  if (!r.ok || !text) return out({ ok: false, error: "model", status: r.status, detail: d?.error?.message || "" }, 502);
  return out({ ok: true, answer: text });
});
