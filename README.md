# Web Downloader CLI

[![npm version](https://img.shields.io/npm/v/web-downloader-cli?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/web-downloader-cli)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-43853d?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)

A terminal tool for archiving complete web pages (HTML, CSS, JavaScript, images, fonts) for offline viewing or markdown export.

`wget` grabs the file. `curl` fetches the bytes. `web-downloader` captures the **whole page**: rewrites links to local paths, follows the asset graph, and ships you a working offline copy or a clean markdown export.

## Features

- Downloads HTML, CSS, JavaScript, images, and other assets
- Binary-safe downloads with gzip/deflate/brotli decompression
- Rewrites links to relative local paths so nested pages work offline
- Discovers assets from `srcset`, inline styles, and CSS `url()` / `@import`
- Optional conversion to Markdown
- Configurable depth for following links
- `robots.txt` modes: obey, warn, or ignore
- Follows redirects automatically with loop protection
- Respects `crawl-delay` directives
- Blocks private-network URLs by default (SSRF protection)
- Parallel asset and page downloads with configurable concurrency
- Page crawl safety limit via `--max-pages`
- Programmatic API for use as a Node.js module

## Install

```bash
npm install -g web-downloader-cli
```

## Usage

```bash
web-downloader https://example.com
```

### Options

```
  -h, --help              Show help message
  -v, --version           Show version number
  -o, --output <dir>      Output directory (default: ./downloaded-site)
  --no-assets             Skip CSS, JS, images, and other assets
  -f, --follow-links      Follow and download linked pages
  -d, --depth <n>         Maximum link-follow depth (default: 1)
  --max-pages <n>         Maximum number of pages to download
  -c, --concurrency <n>   Parallel downloads (default: 5)
  -m, --markdown          Convert HTML to Markdown
  -r, --robots <mode>     How to handle robots.txt (default: ignore)
                          ignore - skip robots.txt entirely
                          obey   - respect rules, skip blocked URLs
                          warn   - warn but proceed
  --allow-private-urls    Allow localhost and private network URLs
  -q, --quiet             Suppress non-error output
  --verbose               Show detailed progress output
```

### Examples

```bash
# Single page with all assets
web-downloader https://example.com

# Convert to Markdown
web-downloader -m https://example.com/article

# Follow linked pages, depth 2, 8 parallel downloads
web-downloader -f -d 2 -c 8 -o ./my-site https://example.com

# Cap crawl size
web-downloader --max-pages 20 -f https://example.com

# Download a local dev server
web-downloader --allow-private-urls http://127.0.0.1:8080

# Respect robots.txt
web-downloader -r obey -f https://example.com
```

## Programmatic API

```javascript
const WebDownloader = require('web-downloader-cli');

async function run() {
  const downloader = new WebDownloader({
    outputDir: './my-downloads',
    includeAssets: true,
    followLinks: true,
    maxDepth: 2,
    maxPages: 20,
    concurrency: 8,
    logLevel: 'info',
    markdown: false,
    robotsTxt: 'obey',
    maxResponseBytes: 50 * 1024 * 1024,
    allowPrivateUrls: false
  });

  await downloader.download('https://example.com');

  if (downloader.failures > 0) {
    process.exitCode = 1;
  }
}

run().catch(console.error);
```

## Project layout

```
bin/web-downloader.js   CLI entry point
lib/                    Core library modules
test/                   Unit and integration tests
web-downloader          Backward-compatible CLI shim
```

## When to use what

| You want to... | Reach for |
|---|---|
| Download a single file | `curl` or `wget` |
| Mirror a static site | `wget --mirror` |
| Save one page to read offline (with images, working CSS) | **`web-downloader`** |
| Save a page as Markdown for LLM ingestion | **`web-downloader -m`** |
| Crawl a JS-heavy site | A real browser tool (Playwright, Puppeteer) |

## License

MIT

## Contributing

PRs welcome. Open an issue first for anything substantial.

Run tests locally:

```bash
npm test
```
