const assert = require('assert');
const { URL } = require('url');
const {
  getRelativePath,
  parseSrcset,
  extractHtmlAssets,
  extractCssReferences
} = require('../web-downloader');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

test('getRelativePath resolves nested page paths', () => {
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

test('parseSrcset extracts image candidates', () => {
  assert.deepStrictEqual(
    parseSrcset('/img/a.jpg 1x, /img/b.jpg 2x'),
    ['/img/a.jpg', '/img/b.jpg']
  );
});

test('extractHtmlAssets finds srcset and inline styles', () => {
  const baseUrl = new URL('https://example.com/blog/post/');
  const html = `
    <img src="/img/a.png" srcset="/img/a.png 1x, /img/b.png 2x">
    <div style="background-image: url('/assets/bg.png')"></div>
    <link href="/css/site.css" rel="stylesheet">
  `;

  const assets = extractHtmlAssets(html, baseUrl);
  const fullUrls = assets.map(asset => asset.fullUrl);

  assert.ok(fullUrls.includes('https://example.com/img/a.png'));
  assert.ok(fullUrls.includes('https://example.com/img/b.png'));
  assert.ok(fullUrls.includes('https://example.com/assets/bg.png'));
  assert.ok(fullUrls.includes('https://example.com/css/site.css'));
});

test('extractCssReferences finds url and import references', () => {
  const css = `
    @import url('/css/base.css');
    body { background: url("../images/bg.png"); }
  `;

  const references = extractCssReferences(css).map(ref => ref.original);

  assert.deepStrictEqual(references, ['/css/base.css', '../images/bg.png']);
});

console.log('All helper tests passed.');
