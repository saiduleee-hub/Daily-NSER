const send = (res, code, body, headers) => {
  const isObj = body && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({ 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
  res.end(isObj ? JSON.stringify(body) : (body || ''));
};
const authed = req => !process.env.UPLOAD_PASSWORD || req.headers['x-upload-password'] === process.env.UPLOAD_PASSWORD;
function readBody(req) {                       // raw bytes of the request (Vercel allows up to 4.5 MB)
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === 'string') return resolve(Buffer.from(req.body));
    if (req.body && typeof req.body === 'object') return resolve(Buffer.from(JSON.stringify(req.body)));
    const c = []; req.on('data', d => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); req.on('error', reject);
  });
}
module.exports = { send, authed, readBody };
