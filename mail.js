// Reads new Excel attachments from an Outlook mailbox with Microsoft Graph (one pass per call).
// Variables: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_MAILBOX, optional MAIL_SUBJECT_REGEX, MAIL_FROM.
const { getJson, putJson } = require('./store');
const E = process.env, G = 'https://graph.microsoft.com/v1.0';
const enabled = () => !!(E.MS_TENANT_ID && E.MS_CLIENT_ID && E.MS_CLIENT_SECRET && E.MS_MAILBOX);

async function token() {
  const r = await fetch('https://login.microsoftonline.com/' + E.MS_TENANT_ID + '/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.MS_CLIENT_ID, client_secret: E.MS_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' })
  });
  const j = await r.json(); if (!r.ok) throw new Error('token: ' + (j.error_description || r.status)); return j.access_token;
}
async function api(tok, p, raw) {
  const r = await fetch(G + p, { headers: { Authorization: 'Bearer ' + tok } });
  if (!r.ok) throw new Error('graph ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}
async function pollMail(importFile) {
  if (!enabled()) return ['mail sync not configured'];
  const subjectRe = E.MAIL_SUBJECT_REGEX ? new RegExp(E.MAIL_SUBJECT_REGEX, 'i') : null, from = (E.MAIL_FROM || '').toLowerCase();
  const mbox = encodeURIComponent(E.MS_MAILBOX), log = [];
  const state = (await getJson('mailstate')) || { lastReceived: new Date(Date.now() - 3 * 864e5).toISOString() };
  const tok = await token();
  const q = '/users/' + mbox + '/mailFolders/inbox/messages?$select=id,subject,receivedDateTime,from&$filter=' +
    encodeURIComponent('receivedDateTime gt ' + state.lastReceived + ' and hasAttachments eq true') + '&$orderby=receivedDateTime desc&$top=25';
  const msgs = (await api(tok, q)).value.reverse();                         // oldest first, so the newest file wins
  for (const m of msgs) {
    const addr = ((m.from && m.from.emailAddress && m.from.emailAddress.address) || '').toLowerCase();
    if ((!subjectRe || subjectRe.test(m.subject || '')) && (!from || addr === from)) {
      const at = (await api(tok, '/users/' + mbox + '/messages/' + m.id + '/attachments?$select=id,name,size,isInline')).value;
      for (const a of at) {
        if (a.isInline || !/\.xls[xm]$/i.test(a.name || '')) continue;
        try { const buf = await api(tok, '/users/' + mbox + '/messages/' + m.id + '/attachments/' + a.id + '/$value', true);
          log.push('loaded ' + a.name + ' ' + JSON.stringify(await importFile(buf, a.name))); }
        catch (e) { log.push('skipped ' + a.name + ' - ' + e.message); }
      }
    }
    state.lastReceived = m.receivedDateTime;
  }
  await putJson('mailstate', state); return log;
}
module.exports = { pollMail, enabled };
