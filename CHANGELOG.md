# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-05-31

### Added
- Modular `lib/` architecture with thin `bin/web-downloader.js` CLI
- Binary-safe downloads with gzip, deflate, and brotli decompression
- Relative URL rewriting for nested pages and CSS assets
- Expanded asset discovery (`srcset`, inline styles, CSS `url()` / `@import`)
- Parallel downloads with configurable concurrency
- Crawl safety via `--max-pages`
- SSRF protection for private-network URLs (opt out with `--allow-private-urls`)
- CDN asset support via `--allow-external-assets`
- CLI flags: `--version`, `--timeout`, `--user-agent`, `--quiet`, `--verbose`
- Download summary with page/asset/error counts
- Unit and integration tests with GitHub Actions CI

### Fixed
- Binary assets no longer corrupted by UTF-8 string handling
- Navigation `<a href>` links no longer downloaded as assets
- Circular CSS imports handled safely
- Redirect loop protection (max 10 redirects)

### Changed
- Default Node.js requirement raised to 18+
- `main` entry point moved to `lib/index.js`
- Improved markdown conversion for lists, code blocks, and blockquotes

## [1.0.0] - Initial release

- Single-file CLI for downloading web pages with assets
- Optional markdown export and robots.txt modes
