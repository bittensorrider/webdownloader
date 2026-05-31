const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');
const { MAX_REDIRECTS, DEFAULT_MAX_RESPONSE_BYTES } = require('./constants');
const { assertAllowedUrl } = require('./security');

function decompressBody(body, encoding) {
  if (!encoding) {
    return body;
  }

  const normalized = encoding.trim().toLowerCase();

  if (normalized === 'gzip') {
    return zlib.gunzipSync(body);
  }

  if (normalized === 'deflate') {
    return zlib.inflateSync(body);
  }

  if (normalized === 'br') {
    return zlib.brotliDecompressSync(body);
  }

  return body;
}

function createFetcher(options) {
  const {
    userAgent,
    timeout,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    allowPrivateUrls = false,
    log = console.log
  } = options;

  async function fetchResponse(url, redirectCount = 0) {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error(`Too many redirects (${MAX_REDIRECTS})`);
    }

    await assertAllowedUrl(url, { allowPrivateUrls });

    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const requestOptions = {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        timeout
      };

      const req = protocol.get(url, requestOptions, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = new URL(response.headers.location, url).href;
          log(`Redirecting to: ${redirectUrl}`);
          fetchResponse(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        let totalBytes = 0;

        response.on('data', (chunk) => {
          totalBytes += chunk.length;

          if (totalBytes > maxResponseBytes) {
            req.destroy();
            reject(new Error(`Response exceeded max size (${maxResponseBytes} bytes)`));
            return;
          }

          chunks.push(chunk);
        });

        response.on('end', () => {
          try {
            const rawBody = Buffer.concat(chunks);
            const body = decompressBody(rawBody, response.headers['content-encoding']);

            resolve({
              body,
              contentType: response.headers['content-type'] || ''
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out after ${timeout}ms`));
      });
    });
  }

  return { fetchResponse };
}

module.exports = {
  createFetcher,
  decompressBody
};
