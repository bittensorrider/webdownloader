#!/usr/bin/env node

const path = require('path');
const { version: PACKAGE_VERSION } = require('../package.json');
const WebDownloader = require('../lib/index');

function nextArg(args, index, flag) {
  const value = args[index + 1];

  if (!value || value.startsWith('-')) {
    console.error(`Error: ${flag} requires a value`);
    process.exit(1);
  }

  return value;
}

function parsePositiveInt(value, flag) {
  const parsed = parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed < 1) {
    console.error(`Error: ${flag} requires a positive integer`);
    process.exit(1);
  }

  return parsed;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    urls: [],
    outputDir: './downloaded-site',
    includeAssets: true,
    followLinks: false,
    maxDepth: 1,
    maxPages: 0,
    concurrency: 5,
    markdown: false,
    robotsTxt: 'ignore',
    allowPrivateUrls: false,
    logLevel: 'info'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    } else if (arg === '-v' || arg === '--version') {
      console.log(PACKAGE_VERSION);
      process.exit(0);
    } else if (arg === '-o' || arg === '--output') {
      options.outputDir = nextArg(args, i, arg);
      i += 1;
    } else if (arg === '--no-assets') {
      options.includeAssets = false;
    } else if (arg === '-f' || arg === '--follow-links') {
      options.followLinks = true;
    } else if (arg === '-d' || arg === '--depth') {
      const depthValue = nextArg(args, i, arg);
      const maxDepth = parseInt(depthValue, 10);

      if (Number.isNaN(maxDepth) || maxDepth < 0) {
        console.error(`Error: Invalid depth value: ${depthValue}`);
        process.exit(1);
      }

      options.maxDepth = maxDepth;
      i += 1;
    } else if (arg === '--max-pages') {
      options.maxPages = parsePositiveInt(nextArg(args, i, arg), arg);
      i += 1;
    } else if (arg === '-c' || arg === '--concurrency') {
      options.concurrency = parsePositiveInt(nextArg(args, i, arg), arg);
      i += 1;
    } else if (arg === '-m' || arg === '--markdown') {
      options.markdown = true;
    } else if (arg === '-r' || arg === '--robots') {
      const robotsOption = nextArg(args, i, arg);
      if (['obey', 'ignore', 'warn'].includes(robotsOption)) {
        options.robotsTxt = robotsOption;
      } else {
        console.error(`Invalid robots.txt option: ${robotsOption}. Use: obey, ignore, or warn`);
        process.exit(1);
      }
      i += 1;
    } else if (arg === '--allow-private-urls') {
      options.allowPrivateUrls = true;
    } else if (arg === '-q' || arg === '--quiet') {
      options.logLevel = 'quiet';
    } else if (arg === '--verbose') {
      options.logLevel = 'verbose';
    } else if (arg.startsWith('-')) {
      console.error(`Error: Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    } else {
      try {
        const parsed = new URL(arg);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('unsupported protocol');
        }
        options.urls.push(parsed.href);
      } catch (error) {
        console.error(`Error: Invalid URL: ${arg}`);
        process.exit(1);
      }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Web Page Downloader - Download complete web pages with all assets

USAGE:
  web-downloader [OPTIONS] <URL>...

OPTIONS:
  -h, --help              Show this help message
  -v, --version           Show version number
  -o, --output <dir>      Output directory (default: ./downloaded-site)
  --no-assets             Don't download CSS, JS, images, etc.
  -f, --follow-links      Follow and download linked pages
  -d, --depth <n>         Maximum depth for following links (default: 1)
  --max-pages <n>         Maximum number of pages to download (default: unlimited)
  -c, --concurrency <n>   Parallel downloads (default: 5)
  -m, --markdown          Convert HTML to Markdown
  -r, --robots <mode>     How to handle robots.txt (default: ignore)
                          ignore - Completely ignore robots.txt
                          obey   - Respect robots.txt rules (skip blocked URLs)
                          warn   - Show warnings but download anyway
  --allow-private-urls    Allow localhost and private network URLs
  -q, --quiet             Suppress non-error output
  --verbose               Show detailed progress output

EXAMPLES:
  web-downloader https://example.com
  web-downloader -c 8 -f -d 2 https://example.com
  web-downloader --max-pages 10 -f https://example.com
  web-downloader --allow-private-urls http://127.0.0.1:8080
`);
}

async function main() {
  const options = parseArgs();

  if (options.urls.length === 0) {
    console.error('Error: No URL provided');
    printHelp();
    process.exit(1);
  }

  if (options.logLevel !== 'quiet') {
    console.log('Web Page Downloader');
    console.log('===================\n');
  }

  const downloader = new WebDownloader(options);

  for (const url of options.urls) {
    try {
      downloader.log.info(`\nStarting download: ${url}`);
      await downloader.download(url);
    } catch (error) {
      downloader.log.error(`Failed to download ${url}:`, error.message);
      downloader.failures += 1;
    }
  }

  if (downloader.failures > 0) {
    if (options.logLevel !== 'quiet') {
      console.error(`\nCompleted with ${downloader.failures} error(s).`);
      console.log(`Files saved to: ${path.resolve(options.outputDir)}`);
    }
    process.exit(1);
  }

  if (options.logLevel !== 'quiet') {
    console.log('\nDownload complete!');
    console.log(`Files saved to: ${path.resolve(options.outputDir)}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  printHelp,
  main
};
