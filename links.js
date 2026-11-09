const { send, authed } = require('../lib/http'); const { loadLinks, publicLinks } = require('../lib/core');
module.exports = async (req, res) => { if (!authed(req)) return send(res, 401, ''); try { send(res, 200, publicLinks(await loadLinks())); } catch (e) { send(res, 500, String(e.message)); } };
