const path = require('path');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosixPath(filepath) {
  return filepath.split(path.sep).join('/');
}

function getRelativePath(fromFile, toFile) {
  const fromDir = path.posix.dirname(toPosixPath(fromFile));
  const target = toPosixPath(toFile);
  const relative = path.posix.relative(fromDir, target);

  if (!relative || relative === '.') {
    return path.posix.basename(target);
  }

  return relative;
}

function getFilename(url) {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  let pathname = parsed.pathname;

  if (pathname === '/' || pathname === '') {
    return 'index.html';
  }

  if (!path.extname(pathname)) {
    pathname += '/index.html';
  }

  return pathname.replace(/^\//, '');
}

function getAssetStoragePath(url, pageOrigin, sameOriginOnly = true) {
  const parsed = typeof url === 'string' ? new URL(url) : url;

  if (sameOriginOnly && parsed.origin !== pageOrigin) {
    throw new Error(`External asset blocked by same-origin policy: ${parsed.href}`);
  }

  if (parsed.origin === pageOrigin) {
    return getFilename(parsed);
  }

  const hostDir = parsed.hostname.replace(/[^a-zA-Z0-9.-]+/g, '_');
  return `_external/${hostDir}/${getFilename(parsed)}`;
}

module.exports = {
  escapeRegex,
  toPosixPath,
  getRelativePath,
  getFilename,
  getAssetStoragePath
};
