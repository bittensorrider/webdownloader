const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const RobotsTxtParser = require('./robots');
const { createFetcher } = require('./fetch');
const { assertAllowedUrl } = require('./security');
const { escapeRegex, getRelativePath, getFilename } = require('./paths');
const {
  extractHtmlAssets,
  extractCssReferences,
  isCssResource,
  isTextResource
} = require('./assets');
const { convertToMarkdown } = require('./markdown');
const { mapPool } = require('./concurrency');
const { createLogger } = require('./logger');
const { DEFAULT_MAX_RESPONSE_BYTES, DEFAULT_CONCURRENCY } = require('./constants');

class WebDownloader {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './downloaded-site',
      includeAssets: options.includeAssets !== false,
      followLinks: options.followLinks || false,
      maxDepth: options.maxDepth || 1,
      maxPages: options.maxPages || 0,
      concurrency: options.concurrency || DEFAULT_CONCURRENCY,
      userAgent: options.userAgent || 'WebDownloader/1.0',
      timeout: options.timeout || 30000,
      maxResponseBytes: options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
      allowPrivateUrls: options.allowPrivateUrls || false,
      markdown: options.markdown || false,
      robotsTxt: options.robotsTxt || 'ignore',
      logLevel: options.logLevel || 'info',
      ...options
    };

    this.log = createLogger(this.options.logLevel);
    this.downloaded = new Set();
    this.savedAssets = new Map();
    this.pendingAssets = new Map();
    this.failures = 0;
    this.robotsParsers = new Map();
    this.lastCrawlTime = new Map();
    this.fetcher = createFetcher({
      userAgent: this.options.userAgent,
      timeout: this.options.timeout,
      maxResponseBytes: this.options.maxResponseBytes,
      allowPrivateUrls: this.options.allowPrivateUrls,
      log: (...args) => this.log.verbose(...args)
    });
  }

  hasReachedPageLimit() {
    return this.options.maxPages > 0 && this.downloaded.size >= this.options.maxPages;
  }

  async getRobotsParser(origin) {
    if (this.robotsParsers.has(origin)) {
      return this.robotsParsers.get(origin);
    }

    try {
      const robotsUrl = `${origin}/robots.txt`;
      this.log.verbose(`Fetching robots.txt from: ${robotsUrl}`);
      const robotsTxt = await this.fetchPage(robotsUrl);
      const parser = new RobotsTxtParser(robotsTxt, this.options.userAgent);
      this.robotsParsers.set(origin, parser);
      return parser;
    } catch (error) {
      this.log.verbose(`No robots.txt found at ${origin}, allowing all URLs`);
      const parser = new RobotsTxtParser('', this.options.userAgent);
      this.robotsParsers.set(origin, parser);
      return parser;
    }
  }

  async checkRobotsTxt(url) {
    if (this.options.robotsTxt === 'ignore') {
      return true;
    }

    const parsedUrl = new URL(url);
    const origin = parsedUrl.origin;
    const parser = await this.getRobotsParser(origin);
    const isAllowed = parser.isAllowed(parsedUrl.pathname);

    if (!isAllowed) {
      if (this.options.robotsTxt === 'obey') {
        this.log.info(`Blocked by robots.txt: ${url}`);
        return false;
      }

      if (this.options.robotsTxt === 'warn') {
        this.log.info(`Warning: ${url} is disallowed by robots.txt (downloading anyway)`);
        return true;
      }
    }

    const crawlDelay = parser.getCrawlDelay();
    if (crawlDelay) {
      const lastCrawl = this.lastCrawlTime.get(origin) || 0;
      const now = Date.now();
      const timeSinceLastCrawl = now - lastCrawl;
      const requiredDelay = crawlDelay * 1000;

      if (timeSinceLastCrawl < requiredDelay) {
        const waitTime = requiredDelay - timeSinceLastCrawl;
        this.log.verbose(`Crawl-delay: waiting ${waitTime}ms before downloading from ${origin}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      this.lastCrawlTime.set(origin, Date.now());
    }

    return true;
  }

  async download(url, depth = 0) {
    try {
      await assertAllowedUrl(url, { allowPrivateUrls: this.options.allowPrivateUrls });

      if (this.downloaded.has(url) || depth > this.options.maxDepth || this.hasReachedPageLimit()) {
        return;
      }

      const allowed = await this.checkRobotsTxt(url);
      if (!allowed) {
        return;
      }

      if (this.downloaded.has(url) || this.hasReachedPageLimit()) {
        return;
      }

      this.downloaded.add(url);
      this.log.info(`Downloading: ${url}`);

      const parsedUrl = new URL(url);
      const html = await this.fetchPage(url);

      if (!html) {
        this.log.error(`Failed to download: ${url}`);
        this.failures += 1;
        return;
      }

      const filename = getFilename(parsedUrl);
      const filepath = path.join(this.options.outputDir, filename);
      const dir = path.dirname(filepath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let processedHtml = html;

      if (this.options.includeAssets) {
        processedHtml = await this.downloadAssets(html, parsedUrl, filename);
      }

      if (this.options.markdown) {
        const markdown = convertToMarkdown(processedHtml);
        fs.writeFileSync(filepath.replace('.html', '.md'), markdown, 'utf8');
      } else {
        fs.writeFileSync(filepath, processedHtml, 'utf8');
      }

      this.log.info(`Saved: ${filepath}`);

      if (this.options.followLinks && depth < this.options.maxDepth && !this.hasReachedPageLimit()) {
        const links = this.extractLinks(html, parsedUrl);
        await mapPool(links, this.options.concurrency, (link) => this.download(link, depth + 1));
      }
    } catch (error) {
      this.log.error(`Error downloading ${url}:`, error.message);
      this.failures += 1;
    }
  }

  async fetchPage(url) {
    const { body } = await this.fetcher.fetchResponse(url);
    return body.toString('utf8');
  }

  async fetchResource(url) {
    const { body, contentType } = await this.fetcher.fetchResponse(url);
    const isText = isTextResource(url, contentType);

    return {
      body,
      content: isText ? body.toString('utf8') : body,
      isText,
      contentType
    };
  }

  async ensureAssetDownloaded(fullUrl, origin) {
    if (this.savedAssets.has(fullUrl)) {
      return this.savedAssets.get(fullUrl);
    }

    if (this.pendingAssets.has(fullUrl)) {
      return this.pendingAssets.get(fullUrl);
    }

    const downloadPromise = this.downloadAsset(fullUrl, origin);
    this.pendingAssets.set(fullUrl, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      this.pendingAssets.delete(fullUrl);
    }
  }

  async downloadAsset(fullUrl, origin) {
    const assetLocalPath = getFilename(new URL(fullUrl));
    this.savedAssets.set(fullUrl, assetLocalPath);

    try {
      const { content, isText, contentType } = await this.fetchResource(fullUrl);
      const filepath = path.join(this.options.outputDir, assetLocalPath);
      const dir = path.dirname(filepath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let fileContent = content;

      if (isText && isCssResource(fullUrl, contentType)) {
        fileContent = await this.rewriteCssAssets(content, new URL(fullUrl), assetLocalPath, origin);
      }

      if (isText) {
        fs.writeFileSync(filepath, fileContent, 'utf8');
      } else {
        fs.writeFileSync(filepath, fileContent);
      }

      this.log.verbose(`Downloaded asset: ${assetLocalPath}`);
      return assetLocalPath;
    } catch (error) {
      this.savedAssets.delete(fullUrl);
      throw error;
    }
  }

  async rewriteCssAssets(css, cssBaseUrl, cssLocalPath, origin) {
    const references = extractCssReferences(css);

    const replacements = await mapPool(
      references,
      this.options.concurrency,
      async (reference) => {
        try {
          const nestedFullUrl = new URL(reference.original, cssBaseUrl).href;
          if (!nestedFullUrl.startsWith(origin)) {
            return null;
          }

          const nestedLocalPath = await this.ensureAssetDownloaded(nestedFullUrl, origin);

          return {
            original: reference.original,
            relativePath: getRelativePath(cssLocalPath, nestedLocalPath)
          };
        } catch (error) {
          this.log.error(`Failed to download CSS asset: ${reference.original}`, error.message);
          this.failures += 1;
          return null;
        }
      }
    );

    for (const replacement of replacements) {
      if (!replacement) {
        continue;
      }

      css = css.replace(
        new RegExp(escapeRegex(replacement.original), 'g'),
        replacement.relativePath
      );
    }

    return css;
  }

  async downloadAssets(html, baseUrl, pageLocalPath) {
    const assets = extractHtmlAssets(html, baseUrl);
    const origin = baseUrl.origin;

    const replacements = await mapPool(
      assets,
      this.options.concurrency,
      async (asset) => {
        try {
          const assetLocalPath = await this.ensureAssetDownloaded(asset.fullUrl, origin);
          const relativePath = getRelativePath(pageLocalPath, assetLocalPath);
          return { original: asset.original, relativePath };
        } catch (error) {
          this.log.error(`Failed to download asset: ${asset.fullUrl}`, error.message);
          this.failures += 1;
          return null;
        }
      }
    );

    for (const replacement of replacements) {
      if (!replacement) {
        continue;
      }

      html = html.replace(
        new RegExp(escapeRegex(replacement.original), 'g'),
        replacement.relativePath
      );
    }

    return html;
  }

  extractLinks(html, baseUrl) {
    const linkRegex = /href=["']([^"']+)["']/g;
    const links = new Set();
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const link = match[1];
      if (!link.startsWith('#') && !link.startsWith('javascript:') && !link.startsWith('mailto:')) {
        try {
          const fullUrl = new URL(link, baseUrl).href;
          if (fullUrl.startsWith(baseUrl.origin)) {
            links.add(fullUrl);
          }
        } catch (e) {
          // Invalid URL, skip
        }
      }
    }

    return Array.from(links);
  }
}

module.exports = WebDownloader;
