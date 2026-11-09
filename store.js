// Storage on Upstash Redis (add it from the Vercel Marketplace: Storage > Upstash Redis).
// Values are gzip-compressed and cut into 700 KB parts, because one request may be at most 1 MB.
const zlib = require('zlib');
const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PART = 700000;

async function cmd(args) {
  if (!URL_() || !TOKEN()) throw new Error('Storage is not connected. Add Upstash Redis to the Vercel project (see README).');
  const r = await fetch(URL_(), { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Storage error: ' + (j.error || r.status));
  return j.result;
}
async function putStr(key, str) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), n = Math.max(1, Math.ceil(str.length / PART));
  for (let i = 0; i < n; i++) await cmd(['SET', key + ':' + id + ':' + i, str.slice(i * PART, (i + 1) * PART)]);
  const old = await cmd(['GET', key]);
  await cmd(['SET', key, JSON.stringify({ id, n })]);                       // switch to the new version last
  if (old) { try { const o = JSON.parse(old); for (let i = 0; i < o.n; i++) await cmd(['DEL', key + ':' + o.id + ':' + i]); } catch (e) {} }
}
async function getStr(key) {
  const h = await cmd(['GET', key]); if (!h) return null;
  const { id, n } = JSON.parse(h); let s = '';
  for (let i = 0; i < n; i++) s += (await cmd(['GET', key + ':' + id + ':' + i])) || '';
  return s;
}
const putJson = (key, obj) => putStr(key, zlib.gzipSync(Buffer.from(JSON.stringify(obj))).toString('base64'));
async function getJson(key) {
  const s = await getStr(key); if (!s) return null;
  return JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString());
}
module.exports = { putJson, getJson, cmd };
