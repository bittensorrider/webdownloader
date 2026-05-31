const dns = require('dns').promises;
const net = require('net');
const { URL } = require('url');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1'
]);

function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

function isPrivateAddress(address) {
  const ipVersion = net.isIP(address);

  if (ipVersion === 4) {
    return isPrivateIPv4(address);
  }

  if (ipVersion === 6) {
    const normalized = address.toLowerCase();

    if (normalized === '::1') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

    return false;
  }

  return false;
}

function normalizeHostname(hostname) {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

async function assertAllowedUrl(url, options = {}) {
  const { allowPrivateUrls = false } = options;
  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }

  if (allowPrivateUrls) {
    return;
  }

  const hostname = normalizeHostname(parsed.hostname);

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error(`Blocked URL host: ${hostname}`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`Blocked private URL: ${url}`);
    }
    return;
  }

  const records = await dns.lookup(hostname, { all: true });

  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error(`Blocked private URL: ${url}`);
    }
  }
}

module.exports = {
  assertAllowedUrl,
  isPrivateAddress
};
