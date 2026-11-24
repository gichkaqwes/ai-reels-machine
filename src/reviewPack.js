'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const cfg   = require('./config');
const log   = require('./utils/logger');

async function translateToRussian(text) {
  const buf = Buffer.from(JSON.stringify({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages:   [{ role: 'user', content: `Translate to Russian. Return ONLY the translated text, no notes.\n\n${text}` }],
  }));

  const res = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers:  {
          'x-api-key':         cfg.CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
          'Content-Length':    buf.length,
        },
      },
      r => {
        const chunks = [];
        r.on('data', d => chunks.push(d));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });

  if (res.status !== 200)
    throw new Error(`Claude translate error ${res.status}: ${res.body.slice(0, 200)}`);

  return JSON.parse(res.body).content[0].text.trim();
}

async function createReviewPack({ topic, script, duration, outDir }) {
  log.info('ReviewPack: creating review files...');

  // 1. script_en.txt — full English voiceover
  const enPath = path.join(outDir, 'script_en.txt');
  fs.writeFileSync(enPath, script.voiceover, 'utf8');
  log.ok('ReviewPack: script_en.txt saved');

  // 2. script_ru.txt — Russian translation via Claude
  log.info('ReviewPack: translating voiceover to Russian...');
  const ruText = await translateToRussian(script.voiceover);
  const ruPath = path.join(outDir, 'script_ru.txt');
  fs.writeFileSync(ruPath, ruText, 'utf8');
  log.ok('ReviewPack: script_ru.txt saved');

  // 3. review_summary.txt — structured overview
  const factsBlock = script.facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const summary = [
    `TOPIC:    ${topic}`,
    `TITLE:    ${script.title}`,
    ``,
    `HOOK:`,
    script.hook,
    ``,
    `FACTS:`,
    factsBlock,
    ``,
    `CTA:`,
    script.cta,
    ``,
    `DURATION: ${duration.toFixed(1)}s`,
    `OUTPUT:   ${outDir}`,
  ].join('\n');

  const sumPath = path.join(outDir, 'review_summary.txt');
  fs.writeFileSync(sumPath, summary, 'utf8');
  log.ok('ReviewPack: review_summary.txt saved');

  return { enPath, ruPath, sumPath };
}

module.exports = { createReviewPack };
