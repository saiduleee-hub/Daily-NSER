const { send, authed, readBody } = require('../lib/http'); const { loadLinks, saveLinks, syncLink } = require('../lib/core');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, '');
  if (!authed(req)) return send(res, 401, '');
  try {
    const link = String((JSON.parse((await readBody(req)).toString()) || {}).url || '').trim();
    const list = await loadLinks(); let e = list.find(x => x.url === link);
    if (!e) { e = { url: link }; list.push(e); }
    let out; try { out = await syncLink(e, true); } catch (err) { if (!e.hash) list.splice(list.indexOf(e), 1); await saveLinks(list); throw err; }
    await saveLinks(list); send(res, 200, Object.assign({ ok: true, name: e.name }, out));
  } catch (err) { send(res, 400, String(err.message || 'Could not load the link')); }
};
