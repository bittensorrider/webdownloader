const assert = require('assert');
const zlib = require('zlib');
const {
  getRelativePath,
  parseSrcset,
  extractHtmlAssets,
  extractCssReferences,
  isPrivateAddress,
  decompressBody,
  mapPool
} = require('../lib/index');
const { convertToMarkdown } = require('../lib/markdown');

function test(name, fn) {
  return Promise.resolve(fn()).then(
    () => console.log(`ok - ${name}`),
    (error) => {
      console.error(`fail - ${name}`);
      throw error;
    }
  );
}

async function run() {
  await test('getRelativePath resolves nested page paths', () => {
    assert.strictEqual(getRelativePath('index.html', 'css/app.css'), 'css/app.css');
    assert.strictEqual(
      getRelativePath('blog/post/index.html', 'css/app.css'),
      '../../css/app.css'
    );
    assert.strictEqual(
      getRelativePath('blog/post/index.html', 'blog/assets/logo.png'),
      '../assets/logo.png'
    );
  });

  await test('parseSrcset extracts image candidates', () => {
    assert.deepStrictEqual(
      parseSrcset('/img/a.jpg 1x, /img/b.jpg 2x'),
      ['/img/a.jpg', '/img/b.jpg']
    );
  });

  await test('extractHtmlAssets finds srcset and inline styles', () => {
    const baseUrl = new URL('https://example.com/blog/post/');
    const html = `
      <img src="/img/a.png" srcset="/img/a.png 1x, /img/b.png 2x">
      <div style="background-image: url('/assets/bg.png')"></div>
      <link href="/css/site.css" rel="stylesheet">
      <a href="/about/">About</a>
    `;

    const assets = extractHtmlAssets(html, baseUrl);
    const fullUrls = assets.map(asset => asset.fullUrl);

    assert.ok(fullUrls.includes('https://example.com/img/a.png'));
    assert.ok(fullUrls.includes('https://example.com/img/b.png'));
    assert.ok(fullUrls.includes('https://example.com/assets/bg.png'));
    assert.ok(fullUrls.includes('https://example.com/css/site.css'));
    assert.ok(!fullUrls.includes('https://example.com/about/'));
  });

  await test('extractCssReferences finds url and import references', () => {
    const css = `
      @import url('/css/base.css');
      body { background: url("../images/bg.png"); }
    `;

    const references = extractCssReferences(css).map(ref => ref.original);

    assert.deepStrictEqual(references, ['/css/base.css', '../images/bg.png']);
  });

  await test('isPrivateAddress detects common private ranges', () => {
    assert.strictEqual(isPrivateAddress('127.0.0.1'), true);
    assert.strictEqual(isPrivateAddress('10.0.0.5'), true);
    assert.strictEqual(isPrivateAddress('192.168.1.20'), true);
    assert.strictEqual(isPrivateAddress('93.184.216.34'), false);
  });

  await test('decompressBody handles gzip responses', () => {
    const original = Buffer.from('hello offline world');
    const compressed = zlib.gzipSync(original);
    const decompressed = decompressBody(compressed, 'gzip');

    assert.strictEqual(decompressed.toString('utf8'), 'hello offline world');
  });

  await test('mapPool runs workers with a concurrency limit', async () => {
    const order = [];
    const results = await mapPool([1, 2, 3, 4], 2, async (value) => {
      order.push(value);
      return value * 2;
    });

    assert.deepStrictEqual(results, [2, 4, 6, 8]);
    assert.deepStrictEqual(order.sort((a, b) => a - b), [1, 2, 3, 4]);
  });

  await test('convertToMarkdown handles lists and code blocks', () => {
    const markdown = convertToMarkdown(`
      <h1>Title</h1>
      <ul><li>One</li><li>Two</li></ul>
      <pre><code>const x = 1;</code></pre>
    `);

    assert.match(markdown, /# Title/);
    assert.match(markdown, /- One/);
    assert.match(markdown, /```/);
    assert.match(markdown, /const x = 1;/);
  });

  console.log('All helper tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
