'use strict';
const fs   = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function makeOutputDir(topic) {
  const now   = new Date();
  const stamp = now.toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  const slug  = slugify(topic);
  const dir   = path.join(__dirname, '../../outputs', `${stamp}_${slug}`);
  ensureDir(dir);
  return dir;
}

module.exports = { ensureDir, slugify, makeOutputDir };
