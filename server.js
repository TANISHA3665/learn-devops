const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const Redis = require('ioredis');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const redis = new Redis(process.env.REDIS_URL);

// If Redis hiccups, log it but DO NOT crash. The cache is optional.
redis.on('error', (err) => log('warn', 'redis_error', { error: err.message }));

// Logs go to stdout as structured JSON. In a container you never write to
//    log files — the platform collects whatever you print to stdout.
function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...extra }));
}

// --- Cache helpers. Both swallow errors so a dead cache becomes a cache MISS,
//     never an outage. The app degrades to "slower", not "down". ---
async function cacheGet(code) {
  try { 
    return await redis.get(`url:${code}`); 
  }
  catch (err) {
    log('warn', 'cache_unavailable', { error: err.message }); return null;
  }
}

async function cacheSet(code, target) {
  try { 
    await redis.set(`url:${code}`, target, 'EX', 3600); // expires after 1 hour
  }
  catch (err) { 
    log('warn', 'cache_write_failed', { error: err.message }); 
  }
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS urls (
      code       TEXT PRIMARY KEY,
      target     TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

// Liveness: "is the process alive at all?" The platform restarts the container
// if this stops responding (e.g. the app is hung/deadlocked).
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Readiness: can I actually reach my database right now? If not, I am NOT ready
// to serve traffic, so I return 503 and the platform holds requests back.
app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    log('error', 'not_ready', { error: err.message });
    res.status(503).json({ status: 'not ready' });
  }
});

// Create a short URL. Note the $1/$2 placeholders -- parameterized queries,
// which keep user input out of the SQL and block injection.
app.post('/urls', async (req, res) => {
  const { url } = req.body || {};

  if (!url || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'Provide a valid http(s) url' });
  }

  const code = crypto.randomBytes(4).toString('hex');

  await pool.query('INSERT INTO urls (code, target) VALUES ($1, $2)', [code, url]);
  
  log('info', 'url_created', { code });
  
  res.status(201).json({ code, shortUrl: `/${code}` });
});
 
// Cache-aside read path.
app.get('/:code', async (req, res) => {
  const { code } = req.params;
 
  // 1) Try the sticky note first.
  const cached = await cacheGet(code);
  if (cached) {
    log('info', 'cache_hit', { code });
    return res.redirect(302, cached);
  }
 
  // 2) Miss -> go to the db (Postgres).
  log('info', 'cache_miss', { code });
  const { rows } = await pool.query('SELECT target FROM urls WHERE code = $1', [code]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const target = rows[0].target;
 
  // 3) Jot it on the sticky note for next time.
  await cacheSet(code, target);
  res.redirect(302, target);
});
 
// Only start listening once the table is ready. If the DB is unreachable on
// boot, fail loudly rather than serve broken.
init()
  .then(() => app.listen(PORT, () => log('info', 'server_started', { port: PORT })))
  .catch((err) => {
    log('error', 'init_failed', { error: err.message });
    process.exit(1);
  });