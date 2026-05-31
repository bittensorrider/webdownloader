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
const { DEFAULT_MAX_RESPONSE_BYTES } = require('./constants');

class WebDownloader {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './downloaded-site',
      includeAssets: options.includeAssets !== false,
      followLinks: options.followLinks || false,
      maxDepth: options.maxDepth || 1,
      userAgent: options.userAgent || 'WebDownloader/1.0',
      timeout: options.timeout || 30000,
      maxResponseBytes: options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
      allowPrivateUrls: options.allowPrivateUrls || false,
      markdown: options.markdown || false,
      robotsTxt: options.robotsTxt || 'ignore',
      ...options
    };

    this.downloaded = new Set();
    this.savedAssets = new Map();
    this.failures = 0;
    this.robotsParsers = new Map();
    this.lastCrawlTime = new Map();
    this.fetcher = createFetcher({
      userAgent: this.options.userAgent,
      timeout: this.options.timeout,
      maxResponseBytes: this.options.maxResponseBytes,
      allowPrivateUrls: this.options.allowPrivateUrls
    });
  }

  async getRobotsParser(origin) {
    if (this.robotsParsers.has(origin)) {
      return this.robotsParsers.get(origin);
    }

    try {
      const robotsUrl = `${origin}/robots.txt`;
      console.log(`Fetching robots.txt from: ${robotsUrl}`);
      const robotsTxt = await this.fetchPage(robotsUrl);
      const parser = new RobotsTxtParser(robotsTxt, this.options.userAgent);
      this.robotsParsers.set(origin, parser);
      return parser;
    } catch (error) {
      console.log(`No robots.txt found at ${origin}, allowing all URLs`);
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
        console.log(`Blocked by robots.txt: ${url}`);
        return false;
      }

      if (this.options.robotsTxt === 'warn') {
        console.log(`Warning: ${url} is disallowed by robots.txt (downloading anyway)`);
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
        console.log(`Crawl-delay: waiting ${waitTime}ms before downloading from ${origin}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      this.lastCrawlTime.set(origin, Date.now());
    }

    return true;
  }

  async download(url, depth = 0) {
    try {
      await assertAllowedUrl(url, { allowPrivateUrls: this.options.allowPrivateUrls });

      const parsedUrl = new URL(url);

      if (this.downloaded.has(url) || depth > this.options.maxDepth) {
        return;
      }

      const allowed = await this.checkRobotsTxt(url);
      if (!allowed) {
        return;
      }

      this.downloaded.add(url);
      console.log(`Downloading: ${url}`);

      const html = await this.fetchPage(url);

      if (!html) {
        console.error(`Failed to download: ${url}`);
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

      console.log(`Saved: ${filepath}`);

      if (this.options.followLinks && depth < this.options.maxDepth) {
        const links = this.extractLinks(html, parsedUrl);
        for (const link of links) {
          await this.download(link, depth + 1);
        }
      }
    } catch (error) {
      console.error(`Error downloading ${url}:`, error.message);
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

  async ensureAssetDownloaded(fullUrl, origin, referrerLocalPath) {
    if (this.savedAssets.has(fullUrl)) {
      return this.savedAssets.get(fullUrl);
    }

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

      console.log(`Downloaded asset: ${assetLocalPath}`);
      return assetLocalPath;
    } catch (error) {
      this.savedAssets.delete(fullUrl);
      throw error;
    }
  }

  async rewriteCssAssets(css, cssBaseUrl, cssLocalPath, origin) {
    const references = extractCssReferences(css);

    for (const reference of references) {
      try {
        const nestedFullUrl = new URL(reference.original, cssBaseUrl).href;
        if (!nestedFullUrl.startsWith(origin)) {
          continue;
        }

        const nestedLocalPath = await this.ensureAssetDownloaded(
          nestedFullUrl,
          origin,
          cssLocalPath
        );
        const relativePath = getRelativePath(cssLocalPath, nestedLocalPath);

        css = css.replace(
          new RegExp(escapeRegex(reference.original), 'g'),
          relativePath
        );
      } catch (error) {
        console.error(`Failed to download CSS asset: ${reference.original}`, error.message);
        this.failures += 1;
      }
    }

    return css;
  }

  async downloadAssets(html, baseUrl, pageLocalPath) {
    const assets = extractHtmlAssets(html, baseUrl);
    const origin = baseUrl.origin;

    for (const asset of assets) {
      try {
        const assetLocalPath = await this.ensureAssetDownloaded(
          asset.fullUrl,
          origin,
          pageLocalPath
        );
        const relativePath = getRelativePath(pageLocalPath, assetLocalPath);

        html = html.replace(
          new RegExp(escapeRegex(asset.original), 'g'),
          relativePath
        );
      } catch (error) {
        console.error(`Failed to download asset: ${asset.fullUrl}`, error.message);
        this.failures += 1;
      }
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
