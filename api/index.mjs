import http from 'node:http';

export const config = {
  api: {
    bodyParser: false,
  },
};

let serverReadyPromise = null;

function ensureServer() {
  if (!serverReadyPromise) {
    serverReadyPromise = import('../server/index.mjs').then(() => {
      // Allow 150ms for server to bind to port 8787
      return new Promise((resolve) => setTimeout(resolve, 150));
    });
  }
  return serverReadyPromise;
}

export default async function handler(req, res) {
  try {
    await ensureServer();

    const targetUrl = `http://127.0.0.1:8787${req.url}`;

    const proxyReq = http.request(
      targetUrl,
      {
        method: req.method,
        headers: {
          ...req.headers,
          host: '127.0.0.1:8787',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      console.error('API proxy error:', err);
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
      }
      res.end(JSON.stringify({ error: { code: 'bad_gateway', message: err.message } }));
    });

    req.pipe(proxyReq);
  } catch (err) {
    console.error('Server startup error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ error: { code: 'server_error', message: err.message } }));
  }
}
