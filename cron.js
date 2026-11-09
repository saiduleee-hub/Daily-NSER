// Called by Vercel Cron (see vercel.json) around 12 PM Dhaka time: loads saved links and new Outlook mail.
const { send } = require('../lib/http'); const { syncAllLinks, importFile } = require('../lib/core'); const { pollMail } = require('../lib/mail');
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) return send(res, 401, '');
  const log = [];
  try { log.push(...await syncAllLinks()); } catch (e) { log.push('links: ' + e.message); }
  try { log.push(...await pollMail(importFile)); } catch (e) { log.push('mail: ' + e.message); }
  send(res, 200, { ok: true, log });
};
