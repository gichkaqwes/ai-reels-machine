'use strict';
const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../logs/app.log');

function write(level, msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level.padEnd(5)}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
}

module.exports = {
  info:  (m) => write('INFO',  m),
  ok:    (m) => write('OK',    m),
  warn:  (m) => write('WARN',  m),
  error: (m) => write('ERROR', m),
};
