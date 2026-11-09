// POST the Excel file bytes (header x-file-name) or JSON {"fileName","content":"<base64>"}. Vercel limit: 4.5 MB per request.
const { send, authed, readBody } = require('../lib/http'); const { importFile } = require('../lib/core');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, '');
  if (!authed(req)) return send(res, 401, '');
  try {
    let buf = await readBody(req), name = decodeURIComponent(req.headers['x-file-name'] || '');
    if ((req.headers['content-type'] || '').includes('json')) { const j = JSON.parse(buf.toString()); name = j.fileName || j.name || name; buf = Buffer.from(j.content || j.contentBytes || '', 'base64'); }
    send(res, 200, Object.assign({ ok: true }, await importFile(buf, name)));
  } catch (e) { send(res, 400, String(e.message || 'Bad file')); }
};
