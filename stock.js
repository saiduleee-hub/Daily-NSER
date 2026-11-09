const { send } = require('../lib/http'); const { stockPayload } = require('../lib/core');
module.exports = async (req, res) => {
  try { send(res, 200, await stockPayload(), { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }); }
  catch (e) { send(res, 500, String(e.message)); }
};
