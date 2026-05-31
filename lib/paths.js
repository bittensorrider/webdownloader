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
  let pathname = url.pathname;

  if (pathname === '/' || pathname === '') {
    return 'index.html';
  }

  if (!path.extname(pathname)) {
    pathname += '/index.html';
  }

  return pathname.replace(/^\//, '');
}

module.exports = {
  escapeRegex,
  toPosixPath,
  getRelativePath,
  getFilename
};
