const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const TARGETS = {
  '1': process.env.TARGET_2 || 'http://mugiwara-panel.duckdns.org:3041/api',
  '2': process.env.TARGET_1 || 'http://mugiwara-panel.duckdns.org:3038/api',
};

const PROXY_SECRET = process.env.PROXY_SECRET || ''; // optional shared secret

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-proxy-secret');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', servers: TARGETS });
});

app.all('/:server/*', async (req, res) => {
  if (PROXY_SECRET && req.headers['x-proxy-secret'] !== PROXY_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { server } = req.params;
  const target = TARGETS[server];
  if (!target) return res.status(400).json({ error: 'unknown_server' });

  // req.params[0] is the wildcard match (everything after /:server/)
  const rest = req.params[0];
  const qs = req.url.split('?')[1];
  const targetUrl = `${target.replace(/\/$/, '')}/${rest}${qs ? '?' + qs : ''}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const init = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    };
    if (!['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length) {
      init.body = JSON.stringify(req.body);
    }

    const r = await fetch(targetUrl, init);
    clearTimeout(timer);

    const text = await r.text();
    res.status(r.status);
    try {
      res.json(JSON.parse(text));
    } catch {
      res.send(text);
    }
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'worker_timeout' : 'worker_unreachable';
    console.error(`[proxy] ${targetUrl} ->`, e.message);
    res.status(502).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
  console.log('Targets:', TARGETS);
});
