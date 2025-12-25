/**
 * 简单的日志工具
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

export const logger = {
  info(message) {
    console.log(`${colors.cyan}[${getTimestamp()}] [INFO]${colors.reset} ${message}`);
  },

  success(message) {
    console.log(`${colors.green}[${getTimestamp()}] [SUCCESS]${colors.reset} ${message}`);
  },

  warn(message) {
    console.log(`${colors.yellow}[${getTimestamp()}] [WARN]${colors.reset} ${message}`);
  },

  error(message) {
    console.log(`${colors.red}[${getTimestamp()}] [ERROR]${colors.reset} ${message}`);
  },

  step(step, message) {
    console.log(`${colors.blue}[${getTimestamp()}] [STEP ${step}]${colors.reset} ${message}`);
  }
};
