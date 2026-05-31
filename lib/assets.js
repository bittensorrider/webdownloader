const path = require('path');
const { SKIP_URL_PREFIXES, TEXT_EXTENSIONS } = require('./constants');

function isTextContentType(contentType) {
  if (!contentType) {
    return false;
  }

  const type = contentType.split(';')[0].trim().toLowerCase();

  return type.startsWith('text/') ||
    type === 'application/javascript' ||
    type === 'application/x-javascript' ||
    type === 'application/json' ||
    type === 'application/xml' ||
    type === 'image/svg+xml';
}

function isTextResource(url, contentType) {
  if (isTextContentType(contentType)) {
    return true;
  }

  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function shouldSkipUrl(url) {
  const trimmed = url.trim();
  return !trimmed || SKIP_URL_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}

function parseSrcset(value) {
  return value
    .split(',')
    .map(entry => entry.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function addAssetReference(references, seen, original, baseUrl, origin) {
  if (shouldSkipUrl(original)) {
    return;
  }

  try {
    const fullUrl = new URL(original, baseUrl).href;
    if (!fullUrl.startsWith(origin) || seen.has(fullUrl)) {
      return;
    }

    seen.add(fullUrl);
    references.push({ original, fullUrl });
  } catch (e) {
    // Invalid URL, skip
  }
}

function extractCssReferences(css) {
  const references = [];
  const seen = new Set();

  const pushReference = (original) => {
    const trimmed = original.trim();
    if (!trimmed || seen.has(trimmed) || shouldSkipUrl(trimmed)) {
      return;
    }

    seen.add(trimmed);
    references.push({ original: trimmed });
  };

  const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let match;

  while ((match = urlRegex.exec(css)) !== null) {
    pushReference(match[2]);
  }

  const importRegex = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)/gi;
  while ((match = importRegex.exec(css)) !== null) {
    pushReference(match[2] || match[4]);
  }

  return references;
}

function extractHtmlAssets(html, baseUrl) {
  const references = [];
  const seen = new Set();
  const origin = baseUrl.origin;

  const resourceAttributeRegex = /\b(?:src|data-src|poster|content)\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = resourceAttributeRegex.exec(html)) !== null) {
    addAssetReference(references, seen, match[1], baseUrl, origin);
  }

  const linkHrefRegex = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = linkHrefRegex.exec(html)) !== null) {
    addAssetReference(references, seen, match[1], baseUrl, origin);
  }

  const scriptSrcRegex = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = scriptSrcRegex.exec(html)) !== null) {
    addAssetReference(references, seen, match[1], baseUrl, origin);
  }

  const srcsetRegex = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    for (const candidate of parseSrcset(match[1])) {
      addAssetReference(references, seen, candidate, baseUrl, origin);
    }
  }

  const inlineStyleRegex = /style\s*=\s*"([^"]*)"/gi;
  while ((match = inlineStyleRegex.exec(html)) !== null) {
    for (const cssRef of extractCssReferences(match[1])) {
      addAssetReference(references, seen, cssRef.original, baseUrl, origin);
    }
  }

  const inlineStyleSingleQuoteRegex = /style\s*=\s*'([^']*)'/gi;
  while ((match = inlineStyleSingleQuoteRegex.exec(html)) !== null) {
    for (const cssRef of extractCssReferences(match[1])) {
      addAssetReference(references, seen, cssRef.original, baseUrl, origin);
    }
  }

  const styleTagRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((match = styleTagRegex.exec(html)) !== null) {
    for (const cssRef of extractCssReferences(match[1])) {
      addAssetReference(references, seen, cssRef.original, baseUrl, origin);
    }
  }

  return references;
}

function isCssResource(url, contentType) {
  if (contentType && contentType.split(';')[0].trim().toLowerCase() === 'text/css') {
    return true;
  }

  return path.extname(new URL(url).pathname).toLowerCase() === '.css';
}

module.exports = {
  isTextContentType,
  isTextResource,
  shouldSkipUrl,
  parseSrcset,
  extractHtmlAssets,
  extractCssReferences,
  isCssResource
};
