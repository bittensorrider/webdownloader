class RobotsTxtParser {
  constructor(robotsTxt, userAgent = '*') {
    this.userAgent = userAgent;
    this.rules = this.parse(robotsTxt);
  }

  parse(robotsTxt) {
    const rules = {
      disallow: [],
      allow: [],
      crawlDelay: null
    };

    if (!robotsTxt) return rules;

    const lines = robotsTxt.split('\n');
    let relevantSection = false;
    let generalSection = false;
    const generalRules = { disallow: [], allow: [] };

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (key.toLowerCase() === 'user-agent') {
        relevantSection = value === this.userAgent || value === '*';
        generalSection = value === '*';
        continue;
      }

      if (relevantSection) {
        if (key.toLowerCase() === 'disallow') {
          if (generalSection) {
            generalRules.disallow.push(value);
          } else {
            rules.disallow.push(value);
          }
        } else if (key.toLowerCase() === 'allow') {
          if (generalSection) {
            generalRules.allow.push(value);
          } else {
            rules.allow.push(value);
          }
        } else if (key.toLowerCase() === 'crawl-delay') {
          rules.crawlDelay = parseInt(value, 10);
        }
      }
    }

    if (rules.disallow.length === 0 && rules.allow.length === 0) {
      rules.disallow = generalRules.disallow;
      rules.allow = generalRules.allow;
    }

    return rules;
  }

  isAllowed(urlPath) {
    for (const pattern of this.rules.allow) {
      if (this.matchesPattern(urlPath, pattern)) {
        return true;
      }
    }

    for (const pattern of this.rules.disallow) {
      if (this.matchesPattern(urlPath, pattern)) {
        return false;
      }
    }

    return true;
  }

  matchesPattern(urlPath, pattern) {
    if (!pattern) return false;
    if (pattern === urlPath) return true;

    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp('^' + regexPattern).test(urlPath);
  }

  getCrawlDelay() {
    return this.rules.crawlDelay;
  }
}

module.exports = RobotsTxtParser;
