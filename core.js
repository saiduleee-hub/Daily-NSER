const crypto = require('crypto');
const zlib = require('zlib');
const { putJson, getJson } = require('./store');
const { readAllSheets, parseNSER, parseLdao, dateFromName } = require('./xlsx-lite');

async function bumpVersion() {
  const s = await getJson('stock'), l = await getJson('ldao');
  const { cmd } = require('./store');
  await cmd(['SET', 'ver', ((s && s.meta && s.meta.stamp) || 0) + '|' + ((l && l.meta && l.meta.stamp) || 0)]);
}

// Takes any .xlsx: the NSER stock report or the LDD/AOD report. Returns what it did.
async function importFile(buf, name) {
  const sheets = readAllSheets(buf);
  let nser = null, nserErr = null;
  try { nser = parseNSER(sheets[0].rows); } catch (e) { nserErr = e; }
  if (nser) {
    const meta = { depots: nser.depots, count: nser.rows.length, date: dateFromName(name), file: name, stamp: Date.now() };
    await putJson('stock', { meta, rows: nser.rows }); await bumpVersion();
    return { kind: 'nser', count: nser.rows.length, date: meta.date };
  }
  let ld;
  try { ld = parseLdao(sheets); } catch (e) { throw new Error('Not an NSER file (' + nserErr.message + ') and ' + e.message); }
  await putJson('ldao', { meta: { file: name, date: dateFromName(name), stamp: Date.now() }, map: ld.map }); await bumpVersion();
  return { kind: 'ldao', count: ld.count };
}

// ---- File links (File Sender, OneDrive, SharePoint, Google Drive, Dropbox, direct .xlsx) ----
function directUrl(u) {
  u = u.trim();
  let x; try { x = new URL(u); } catch (e) { throw new Error('That is not a valid link.'); }
  const h = x.hostname.toLowerCase();
  if (h === '1drv.ms' || h.endsWith('onedrive.live.com'))
    return 'https://api.onedrive.com/v1.0/shares/u!' + Buffer.from(u).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-') + '/root/content';
  if (h.endsWith('sharepoint.com') || h.endsWith('onedrive.com')) { x.searchParams.set('download', '1'); return x.toString(); }
  if (h === 'drive.google.com') { const m = /\/d\/([^/]+)/.exec(x.pathname) || [null, x.searchParams.get('id')]; if (m[1]) return 'https://drive.google.com/uc?export=download&id=' + m[1]; }
  if (h === 'docs.google.com') { const m = /\/spreadsheets\/d\/([^/]+)/.exec(x.pathname); if (m) return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/export?format=xlsx'; }
  if (h.endsWith('dropbox.com')) { x.searchParams.set('dl', '1'); return x.toString(); }
  return u;
}
async function fetchLink(link) {
  const get = async u => {
    const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 DepotStock' } });
    if (!r.ok) throw new Error('The link answered ' + r.status + '. It must open without signing in.');
    return r;
  };
  let r = await get(directUrl(link)), base = r.url || link;
  if ((r.headers.get('content-type') || '').includes('text/html')) {          // "File Sender" page -> follow its Download button
    const html = await r.text();
    const m = /href=["']([^"']*\/getFile\/[^"']+)["']/i.exec(html) || /href=["']([^"']+\.xls[xm][^"']*)["']/i.exec(html);
    if (!m) throw new Error('The link opened a web page with no Excel download button (it may need a sign-in, or it has expired).');
    base = new URL(m[1].replace(/&amp;/g, '&'), base).toString(); r = await get(base);
  }
  if ((+r.headers.get('content-length') || 0) > 100e6) throw new Error('The file is larger than 100 MB.');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error('The link did not return an Excel file (it may ask to sign in, or it has expired).');
  const cd = r.headers.get('content-disposition') || '';
  let name = (/filename\*=UTF-8''([^;]+)/i.exec(cd) || [])[1];
  try { name = name ? decodeURIComponent(name) : ((/filename="?([^";]+)"?/i.exec(cd) || [])[1] || ''); } catch (e) { name = name || ''; }
  if (!name) { try { name = decodeURIComponent(new URL(base).pathname.split('/').pop() || ''); } catch (e) {} }
  if (!/\.xls[xm]$/i.test(name)) name = (name || 'file') + '.xlsx';
  return { buf, name, hash: crypto.createHash('sha1').update(buf).digest('hex') };
}
async function syncLink(e, force) {
  try {
    const f = await fetchLink(e.url);
    if (!force && f.hash === e.hash) { e.checked = Date.now(); e.error = ''; return null; }
    const out = await importFile(f.buf, f.name);
    Object.assign(e, { hash: f.hash, name: f.name, checked: Date.now(), loaded: Date.now(), kind: out.kind, error: '' });
    return out;
  } catch (err) { e.checked = Date.now(); e.error = String(err.message || err); throw err; }
}
const loadLinks = async () => (await getJson('links')) || [];
const saveLinks = l => putJson('links', l.slice(-10));
const publicLinks = l => l.map(e => ({ url: e.url, name: e.name || '', kind: e.kind || '', loaded: e.loaded || 0, checked: e.checked || 0, error: e.error || '' }));
async function syncAllLinks() {
  const list = await loadLinks(), out = [];
  for (const e of list) { try { const o = await syncLink(e, false); if (o) out.push(e.name + ' ' + JSON.stringify(o)); } catch (err) { out.push('error ' + e.url + ' ' + err.message); } }
  await saveLinks(list); return out;
}

// Stock + LDD/AOD as one gzip-compressed JSON (small enough for Vercel's response limit).
async function stockPayload() {
  const s = (await getJson('stock')) || {}, l = await getJson('ldao');
  return zlib.gzipSync(Buffer.from(JSON.stringify({ meta: s.meta, rows: s.rows, ldao: l && l.map, ldaoMeta: l && l.meta, syncAt: process.env.SYNC_AT || '12:00' })));
}
module.exports = { importFile, syncLink, loadLinks, saveLinks, publicLinks, syncAllLinks, stockPayload };
