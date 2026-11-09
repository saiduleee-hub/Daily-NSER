const { send, authed } = require('../lib/http');
module.exports = (req, res) => send(res, authed(req) ? 200 : 401, '');
