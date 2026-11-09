const { send, authed, readBody } = require('../lib/http'); const { loadLinks, saveLinks } = require('../lib/core');
module.exports = async (req, res) => {
  if (!authed(req)) return send(res, 401, '');
  try { const u = String((JSON.parse((await readBody(req)).toString()) || {}).url || ''); await saveLinks((await loadLinks()).filter(x => x.url !== u)); send(res, 200, 'ok'); }
  catch (e) { send(res, 400, String(e.message)); }
};
