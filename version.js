const { send } = require('../lib/http'); const { cmd } = require('../lib/store');
module.exports = async (req, res) => { try { send(res, 200, (await cmd(['GET', 'ver'])) || '0|0'); } catch (e) { send(res, 500, ''); } };
