/**
 * utils/logger.js
 *
 * Lightweight structured logger with log levels, timestamps, and ANSI colours.
 * Control verbosity via the LOG_LEVEL environment variable:
 *   LOG_LEVEL=debug  → all messages
 *   LOG_LEVEL=info   → info, warn, error  (default)
 *   LOG_LEVEL=warn   → warn, error only
 *   LOG_LEVEL=error  → errors only
 */

'use strict';

const LEVEL_VALUES = Object.freeze({ debug: 0, info: 1, warn: 2, error: 3 });

const CURRENT_LEVEL =
  LEVEL_VALUES[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVEL_VALUES.info;

// ANSI escape codes — only emit if stdout is a real TTY
const isTTY = process.stdout.isTTY;
const c = isTTY
  ? {
      reset:  '\x1b[0m',
      dim:    '\x1b[2m',
      bold:   '\x1b[1m',
      cyan:   '\x1b[36m',
      green:  '\x1b[32m',
      yellow: '\x1b[33m',
      red:    '\x1b[31m',
      blue:   '\x1b[34m',
      magenta:'\x1b[35m',
    }
  : Object.fromEntries(
      ['reset','dim','bold','cyan','green','yellow','red','blue','magenta'].map(k => [k, ''])
    );

/** Returns an ISO timestamp truncated to milliseconds. */
function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

const LABEL = {
  debug: `${c.dim}DEBUG${c.reset}`,
  info:  `${c.cyan}INFO ${c.reset}`,
  warn:  `${c.yellow}WARN ${c.reset}`,
  error: `${c.red}ERROR${c.reset}`,
};

/**
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} tag    - Context label shown in brackets, e.g. 'Room', 'WS'
 * @param {string} msg    - Log message
 */
function log(level, tag, msg) {
  if (LEVEL_VALUES[level] < CURRENT_LEVEL) return;

  const line = `${c.dim}${ts()}${c.reset}  ${LABEL[level]}  ${c.bold}[${tag}]${c.reset}  ${msg}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const logger = {
  debug: (tag, msg) => log('debug', tag, msg),
  info:  (tag, msg) => log('info',  tag, msg),
  warn:  (tag, msg) => log('warn',  tag, msg),
  error: (tag, msg) => log('error', tag, msg),
};

module.exports = logger;
