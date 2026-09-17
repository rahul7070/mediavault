import http from 'node:http';

let serverPromise = null;
const INTERNAL_PORT = 8787;

function ensureServer() {
  if (!serverPromise) {
    process.env.PORT = String(INTERNAL_PORT);
    // server/index.mjs starts listening on process.env.PORT
    serverPromise = import('../server/index.mjs')
      .then(() => new Promise((resolve) => setTimeout(resolve, 100)))
      .catch((err) => {
        // If port is already in use (e.g. in local dev or warm container), server is already up
        if (err?.code === 'EADDRINUSE') {
          return;
        }
        throw err;
      });
  }
  return serverPromise;
}

export default async function handler(req, res) {
  try {
    await ensureServer();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'server_init_failed', message: err.message } }));
    return;
  }

  // Determine the target path:
  // In Vercel, when a rewrite like "/api/:path*" -> "/api" is triggered,
  // req.headers['x-matched-path'] carries the original requested path (e.g. "/api/assets/a_07993").
  let targetPath =
    req.headers['x-matched-path'] ||
    req.headers['x-vercel-matched-path'] ||
    req.url ||
    '/api';

  // If targetPath is just "/api" or does not contain the subpath from req.url
  if (targetPath === '/api' || targetPath === '/api/') {
    if (req.url && req.url !== '/api' && req.url !== '/api/') {
      targetPath = req.url;
    }
  }

  // Preserve query parameters if present on req.url but missing on targetPath
  const queryIndex = (req.url || '').indexOf('?');
  if (queryIndex !== -1 && !targetPath.includes('?')) {
    targetPath += req.url.slice(queryIndex);
  }

  // Ensure request URL starts with /api
  if (!targetPath.startsWith('/api')) {
    targetPath = '/api' + (targetPath.startsWith('/') ? targetPath : '/' + targetPath);
  }

  // Forward the request to the internal mock server
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: INTERNAL_PORT,
      path: targetPath,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${INTERNAL_PORT}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'proxy_failed', message: err.message } }));
    }
  });

  req.pipe(proxyReq);
}
