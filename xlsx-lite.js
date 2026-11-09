// Minimal .xlsx reader (no packages): returns the first sheet as an array of rows.
const zlib = require('zlib');

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not an Excel (.xlsx) file');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42), name = buf.toString('utf8', p + 46, p + 46 + nl);
    files[name] = () => {
      const s = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
      const raw = buf.subarray(s, s + csize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    };
    p += 46 + nl + el + cl;
  }
  return files;
}
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d)).replace(/&amp;/g, '&');
const colIndex = ref => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };

function readAllSheets(buf) {
  const f = unzip(buf);
  let sst = [];
  if (f['xl/sharedStrings.xml']) {
    const x = f['xl/sharedStrings.xml']().toString('utf8');
    for (const m of x.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      let t = ''; for (const tm of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) t += tm[1];
      sst.push(unesc(t));
    }
  }
  const out = [];
  let list = [];
  try {
    const wb = f['xl/workbook.xml']().toString('utf8'), rels = f['xl/_rels/workbook.xml.rels']().toString('utf8');
    const targets = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0]), tg = /Target="([^"]+)"/.exec(m[0]);
      if (id && tg) targets[id[1]] = 'xl/' + tg[1].replace(/^\/?(xl\/)?/, '');
    }
    for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
      const nm = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]+)"/.exec(m[0]);
      if (nm && rid && targets[rid[1]]) list.push({ name: unesc(nm[1]), path: targets[rid[1]] });
    }
  } catch (e) {}
  if (!list.length) list = [{ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }];
  for (const s of list) {
    if (!f[s.path]) continue;
    const xml = f[s.path]().toString('utf8'), rows = [];
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const ri = +/r="(\d+)"/.exec(rm[1])[1] - 1, row = [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = cm[1], body = cm[2] || '';
        const ref = /r="([A-Z]+\d+)"/.exec(a); if (!ref) continue;
        const t = (/t="(\w+)"/.exec(a) || [])[1], v = (/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1];
        let val = null;
        if (t === 'inlineStr') val = unesc([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
        else if (v !== undefined) val = t === 's' ? sst[+v] : t === 'str' ? unesc(v) : t === 'b' ? v === '1' : parseFloat(v);
        row[colIndex(ref[1])] = val;
      }
      rows[ri] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    out.push({ name: s.name, rows });
  }
  return out;
}
const readFirstSheet = buf => readAllSheets(buf)[0].rows;

// Same NSER layout the web page uses.
function parseNSER(A) {
  const depots = [];
  for (let k = 0; k < 24; k++) {
    const c = 4 + 4 * k;
    if (!A[6] || !A[6][c]) throw new Error('This is not the NSER layout (depot columns).');
    depots.push([String(A[6][c]).split('_')[0], String((A[1] && A[1][c]) || A[6][c])]);
  }
  if (String(A[6][103]).indexOf('TOTAL_SHX') < 0) throw new Error('This is not the NSER layout (total columns).');
  const n = v => { v = parseFloat(v); return isFinite(v) ? Math.round(v * 1000) / 1000 : 0; };
  const rows = [];
  for (let i = 7; i < A.length; i++) {
    const r = A[i]; if (!r || r[0] == null || r[0] === '') continue;
    const o = [String(r[0]), r[1] || '', r[2] || '', r[3] || ''];
    for (let k = 0; k < 24; k++) { const c = 4 + 4 * k; o.push(n(r[c]), n(r[c + 1]), n(r[c + 3])); }
    for (const b of [100, 104, 108]) o.push(n(r[b]), n(r[b + 1]), n(r[b + 3]));
    rows.push(o);
  }
  if (rows.length < 100) throw new Error('Too few item rows found.');
  return { depots, rows };
}

// LDD / AOD report: finds the header row holding "LDD" and "AOD" columns and the item-code column.
// Returns { map: {itemCode: [LDD, AOD]}, count }. Repeated codes are added together.
function parseLdao(sheets) {
  const norm = v => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const num = v => { v = parseFloat(v); return isFinite(v) ? Math.round(v * 1000) / 1000 : 0; };
  for (const sh of sheets) {
    const R = sh.rows;
    for (let h = 0; h < Math.min(R.length, 40); h++) {
      const hdr = (R[h] || []).map(norm);
      const li = hdr.findIndex(x => x === 'ldd'), ai = hdr.findIndex(x => x === 'aod');
      if (li < 0 || ai < 0) continue;
      let ci = hdr.findIndex(x => /^(fgcode|itemcode|code|itemid|itemno|fgitemcode|fgid|item)$/.test(x));
      if (ci < 0) ci = 0;
      const map = {}; let count = 0;
      for (let i = h + 1; i < R.length; i++) {
        const r = R[i]; if (!r || r[ci] == null || r[ci] === '') continue;
        const code = String(r[ci]).trim().replace(/\.0+$/, '');
        const m = map[code] || (map[code] = [0, 0]);
        m[0] = Math.round((m[0] + num(r[li])) * 1000) / 1000; m[1] = Math.round((m[1] + num(r[ai])) * 1000) / 1000;
        count++;
      }
      if (count >= 5) return { map, count: Object.keys(map).length };
    }
  }
  throw new Error('Could not find the LDD and AOD columns in this file.');
}

// dd-mm-yyyy from the file name (also yyyy-mm-dd), else today.
function dateFromName(name) {
  const p = x => String(x).padStart(2, '0');
  let m = /(\d{1,2})[-_. \/](\d{1,2})[-_. \/](\d{4})/.exec(name || '');
  if (m) return p(m[1]) + '-' + p(m[2]) + '-' + m[3];
  m = /(?:^|\D)(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])(20\d{2})(?:\D|$)/.exec(name || '');   // 09112026
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /(\d{4})[-_.](\d{2})[-_.](\d{2})/.exec(name || '');
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  const d = new Date(); return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
}
module.exports = { readAllSheets, readFirstSheet, parseNSER, parseLdao, dateFromName };
