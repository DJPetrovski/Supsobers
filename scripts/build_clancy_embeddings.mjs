// Meaning index for the Lindsay Clancy archive search. Same model as the rest of the site.
// Input: data/clancy-text.json. Output: data/clancy-embeddings.bin (int8, 384 per chunk, same order as the text file).
import fs from 'fs';
import { pipeline, env } from '@xenova/transformers';
const DIM = 384;
env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = new URL('../models/', import.meta.url).pathname;
const items = JSON.parse(fs.readFileSync('data/clancy-text.json', 'utf8'));
const out = Buffer.alloc(items.length * DIM);
const ex = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5', { quantized: true });
for (let b = 0; b < items.length; b += 32) {
  const idx = []; for (let i = b; i < Math.min(items.length, b + 32); i++) idx.push(i);
  const r = await ex(idx.map(i => items[i].x.slice(0, 2000)), { pooling: 'mean', normalize: true });
  idx.forEach((i, k) => { for (let d = 0; d < DIM; d++) out.writeInt8(Math.max(-127, Math.min(127, Math.round(r.data[k * DIM + d] * 127))), i * DIM + d); });
  if ((b / 32) % 25 === 0) console.log(b + idx.length, '/', items.length);
}
fs.writeFileSync('data/clancy-embeddings.bin', out);
console.log('wrote', out.length, 'bytes for', items.length, 'chunks');
