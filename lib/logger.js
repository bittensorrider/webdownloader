function createLogger(level = 'info') {
  return {
    info(...args) {
      if (level !== 'quiet') {
        console.log(...args);
      }
    },
    verbose(...args) {
      if (level === 'verbose') {
        console.log(...args);
      }
    },
    error(...args) {
      if (level !== 'quiet') {
        console.error(...args);
      }
    }
  };
}

module.exports = {
  createLogger
};
