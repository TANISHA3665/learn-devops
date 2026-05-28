const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Storage is in-memory for now (a plain Map). We'll swap this for Postgres
//    + Redis later and the rest of the app won't have to change.
const urls = new Map(); // code -> target URL

// 3) Logs go to stdout as structured JSON. In a container you never write to
//    log files — the platform collects whatever you print to stdout.
function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...extra }));
}

// Liveness: "is the process alive at all?" The platform restarts the container
// if this stops responding (e.g. the app is hung/deadlocked).
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Readiness: "am I ready to SERVE traffic yet?" . Modify later
app.get('/readyz', (_req, res) => res.json({ status: 'ready' }));

// Create a short URL
app.post('/urls', (req, res) => {
  const { url } = req.body || {};

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Provide a valid http(s) url' });
  }

  const code = crypto.randomBytes(4).toString('hex'); // 8-char code

  urls.set(code, url);

  log('info', 'url_created', { code });

  res.status(201).json({ code, shortUrl: `/${code}` });
});

// Resolve a short code -> redirect.
app.get('/:code', (req, res) => {
  const target = urls.get(req.params.code);
  if (!target) return res.status(404).json({ error: 'Not found' });
  res.redirect(302, target);
});

app.listen(PORT, () => log('info', 'server_started', { port: PORT }));