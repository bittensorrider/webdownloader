const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const WebDownloader = require('../lib/index');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function test(name, fn) {
  return fn().then(
    () => console.log(`ok - ${name}`),
    (error) => {
      console.error(`fail - ${name}`);
      throw error;
    }
  );
}

function createFixtureServer() {
  const routes = {
    '/': {
      contentType: 'text/html; charset=utf-8',
      body: `<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="/css/site.css">
  </head>
  <body>
    <h1>Fixture Home</h1>
    <img src="/img/dot.png" alt="dot">
    <a href="/about/">About</a>
  </body>
</html>`
    },
    '/about/': {
      contentType: 'text/html; charset=utf-8',
      body: `<!DOCTYPE html>
<html>
  <body>
    <h1>About</h1>
    <a href="/">Home</a>
  </body>
</html>`
    },
    '/css/site.css': {
      contentType: 'text/css; charset=utf-8',
      body: 'body { background-image: url("/img/dot.png"); }'
    },
    '/img/dot.png': {
      contentType: 'image/png',
      body: PNG_1X1,
      encoding: 'gzip'
    }
  };

  const server = http.createServer((req, res) => {
    const route = routes[req.url.split('?')[0]];

    if (!route) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const headers = {
      'Content-Type': route.contentType
    };

    let body = route.body;

    if (route.encoding === 'gzip') {
      body = zlib.gzipSync(body);
      headers['Content-Encoding'] = 'gzip';
    }

    res.writeHead(200, headers);
    res.end(body);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`
      });
    });
  });
}

async function run() {
  await test('downloads page assets with relative rewrites and gzip images', async () => {
    const fixture = await createFixtureServer();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-downloader-'));

    try {
      const downloader = new WebDownloader({
        outputDir,
        allowPrivateUrls: true,
        logLevel: 'quiet',
        concurrency: 3
      });

      await downloader.download(`${fixture.baseUrl}/`);
      assert.strictEqual(downloader.failures, 0);

      const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      assert.match(html, /href="css\/site\.css"/);
      assert.match(html, /src="img\/dot\.png"/);

      const css = fs.readFileSync(path.join(outputDir, 'css/site.css'), 'utf8');
      assert.match(css, /url\("\.\.\/img\/dot\.png"\)|url\(\.\.\/img\/dot\.png\)/);

      const png = fs.readFileSync(path.join(outputDir, 'img/dot.png'));
      assert.ok(png.equals(PNG_1X1));
    } finally {
      fixture.server.close();
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  await test('respects maxPages when following links', async () => {
    const fixture = await createFixtureServer();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-downloader-'));

    try {
      const downloader = new WebDownloader({
        outputDir,
        allowPrivateUrls: true,
        followLinks: true,
        maxDepth: 2,
        maxPages: 1,
        logLevel: 'quiet'
      });

      await downloader.download(`${fixture.baseUrl}/`);

      assert.ok(fs.existsSync(path.join(outputDir, 'index.html')));
      assert.ok(!fs.existsSync(path.join(outputDir, 'about/index.html')));
    } finally {
      fixture.server.close();
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  await test('downloads external CDN assets when sameOriginOnly is disabled', async () => {
    const cdnServer = http.createServer((req, res) => {
      if (req.url === '/app.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end('console.log("cdn");');
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise((resolve) => cdnServer.listen(0, '127.0.0.1', resolve));
    const cdnBaseUrl = `http://127.0.0.1:${cdnServer.address().port}`;

    const siteServer = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><body><script src="${cdnBaseUrl}/app.js"></script></body></html>`);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise((resolve) => siteServer.listen(0, '127.0.0.1', resolve));
    const siteBaseUrl = `http://127.0.0.1:${siteServer.address().port}`;
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-downloader-'));

    try {
      const downloader = new WebDownloader({
        outputDir,
        allowPrivateUrls: true,
        sameOriginOnly: false,
        logLevel: 'quiet'
      });

      await downloader.download(`${siteBaseUrl}/`);

      const stats = downloader.getStats();
      assert.strictEqual(stats.pages, 1);
      assert.ok(stats.assets >= 1);
      assert.strictEqual(stats.failures, 0);

      const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
      assert.match(html, /_external\/127\.0\.0\.1\/app\.js/);
      assert.ok(fs.existsSync(path.join(outputDir, '_external/127.0.0.1/app.js')));
    } finally {
      siteServer.close();
      cdnServer.close();
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  console.log('All integration tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
