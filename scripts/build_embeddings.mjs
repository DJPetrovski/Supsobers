// Builds the "meaning index" for search: one small vector per video title and per transcript chunk.
// Same model the browser uses (all-MiniLM-L6-v2, quantized), so results match exactly.
// Output: data/embeddings.json (list of [videoId, startSec]) + data/embeddings.bin (int8 vectors, 384 each).
// Incremental: vectors for text that has not changed are reused, so each run only embeds new material.
import fs from 'fs';
import crypto from 'crypto';
import { pipeline, env } from '@xenova/transformers';

const DIM = 384;
env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = new URL('../models/', import.meta.url).pathname;
const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return d; } };
const h = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 10);

const vids = (read('data/videos.json', {}).videos || []);
const tr = read('data/transcripts.json', {});
const items = [];   // {id, at, text}
vids.forEach(v => { if (v.id && v.title) items.push({ id: v.id, at: -1, text: v.title }); });
Object.keys(tr).forEach(id => (tr[id] || []).forEach(c => { if (c && c[1] && String(c[1]).length > 20) items.push({ id, at: c[0], text: String(c[1]) }); }));

// reuse
const old = read('data/embeddings.json', { items: [] });
const oldBin = fs.existsSync('data/embeddings.bin') ? fs.readFileSync('data/embeddings.bin') : Buffer.alloc(0);
const cache = new Map();
if (old.items && oldBin.length === old.items.length * DIM) old.items.forEach((it, i) => cache.set(it[0] + ':' + it[1] + ':' + it[2], oldBin.subarray(i * DIM, (i + 1) * DIM)));

const out = Buffer.alloc(items.length * DIM); const meta = []; const todo = [];
items.forEach((it, i) => {
  const key = it.id + ':' + it.at + ':' + h(it.text); meta.push([it.id, it.at, h(it.text)]);
  const hit = cache.get(key); if (hit) hit.copy(out, i * DIM); else todo.push(i);
});
console.log(`${items.length} items, ${items.length - todo.length} reused, ${todo.length} to embed`);
if (todo.length) {
  const ex = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
  for (let b = 0; b < todo.length; b += 32) {
    const idx = todo.slice(b, b + 32);
    const r = await ex(idx.map(i => items[i].text), { pooling: 'mean', normalize: true });
    idx.forEach((i, k) => { for (let d = 0; d < DIM; d++) out.writeInt8(Math.max(-127, Math.min(127, Math.round(r.data[k * DIM + d] * 127))), i * DIM + d); });
    if ((b / 32) % 20 === 0) console.log(b + idx.length, '/', todo.length);
  }
}
fs.writeFileSync('data/embeddings.bin', out);
fs.writeFileSync('data/embeddings.json', JSON.stringify({ model: 'all-MiniLM-L6-v2', dim: DIM, items: meta }));
console.log('wrote', out.length, 'bytes');
