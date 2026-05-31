const WebDownloader = require('./downloader');
const RobotsTxtParser = require('./robots');
const {
  getRelativePath,
  getFilename,
  escapeRegex
} = require('./paths');
const {
  parseSrcset,
  extractHtmlAssets,
  extractCssReferences,
  isTextResource
} = require('./assets');
const { assertAllowedUrl, isPrivateAddress } = require('./security');
const { decompressBody } = require('./fetch');
const { mapPool } = require('./concurrency');
const { createLogger } = require('./logger');

module.exports = WebDownloader;
module.exports.WebDownloader = WebDownloader;
module.exports.RobotsTxtParser = RobotsTxtParser;
module.exports.getRelativePath = getRelativePath;
module.exports.getFilename = getFilename;
module.exports.escapeRegex = escapeRegex;
module.exports.parseSrcset = parseSrcset;
module.exports.extractHtmlAssets = extractHtmlAssets;
module.exports.extractCssReferences = extractCssReferences;
module.exports.isTextResource = isTextResource;
module.exports.assertAllowedUrl = assertAllowedUrl;
module.exports.isPrivateAddress = isPrivateAddress;
module.exports.decompressBody = decompressBody;
module.exports.mapPool = mapPool;
module.exports.createLogger = createLogger;
