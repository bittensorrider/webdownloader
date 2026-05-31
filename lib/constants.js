module.exports = {
  MAX_REDIRECTS: 10,
  DEFAULT_MAX_RESPONSE_BYTES: 50 * 1024 * 1024,
  SKIP_URL_PREFIXES: ['data:', 'javascript:', 'mailto:', '#'],
  TEXT_EXTENSIONS: new Set([
    '.css', '.htm', '.html', '.js', '.json', '.md', '.mjs', '.svg', '.txt', '.xml'
  ])
};
