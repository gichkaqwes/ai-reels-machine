'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const cfg   = require('./config');
const log   = require('./utils/logger');

// ── HTTPS helper ──────────────────────────────────────────────────────────────
function postJSON(hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request(
      {
        hostname,
        path:    urlPath,
        method:  'POST',
        headers: { ...headers, 'Content-Length': buf.length },
      },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => resolve({
          status: res.statusCode,
          body:   Buffer.concat(chunks).toString(),
        }));
      }
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ── Claude prompt ─────────────────────────────────────────────────────────────
function buildPrompt(topic) {
  return `You are a script writer for AI/tech news short-form videos (30-45 seconds).

Topic: ${topic}

Return ONLY valid JSON. No markdown. No code blocks. No extra text before or after.

Required format:
{
  "title": "Short catchy title, max 6 words",
  "hook": "One strong opening sentence, max 15 words, must grab attention instantly",
  "facts": [
    "Fact one — concrete and specific, one sentence",
    "Fact two — concrete and specific, one sentence",
    "Fact three — concrete and specific, one sentence"
  ],
  "voiceover": "Full voiceover for 30-45 seconds. Start with the hook. Cover all 3 facts. End with the CTA. Fast, clear, authoritative tone.",
  "cta": "Short call to action, max 8 words",
  "captions": [
    { "text": "caption text", "start": 0, "end": 3 },
    { "text": "caption text", "start": 3, "end": 8 },
    { "text": "caption text", "start": 8, "end": 14 },
    { "text": "caption text", "start": 14, "end": 20 },
    { "text": "caption text", "start": 20, "end": 27 },
    { "text": "caption text", "start": 27, "end": 35 }
  ]
}

Rules:
- Do not invent specific dates, statistics, or company claims that are not in the topic
- If the topic is vague or lacks enough detail, do NOT invent specific dates, numbers, product names, pricing, features, or company claims. Write a cautious general AI-news style script and clearly avoid unsupported claims
- Facts must be concrete, not generic filler — if you cannot state a concrete fact from the topic, write a cautious observation instead
- All captions together must cover 0 to ~35 seconds
- Return nothing except the JSON object`;
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateScript(obj) {
  const errors = [];

  if (typeof obj.title     !== 'string') errors.push('title must be a string');
  if (typeof obj.hook      !== 'string') errors.push('hook must be a string');
  if (typeof obj.voiceover !== 'string') errors.push('voiceover must be a string');
  if (typeof obj.cta       !== 'string') errors.push('cta must be a string');

  if (!Array.isArray(obj.facts))          errors.push('facts must be an array');
  else if (obj.facts.length !== 3)        errors.push('facts must have exactly 3 items');
  else if (!obj.facts.every(f => typeof f === 'string')) errors.push('every fact must be a string');

  if (!Array.isArray(obj.captions))       errors.push('captions must be an array');
  else {
    obj.captions.forEach((c, i) => {
      if (typeof c.text  !== 'string') errors.push(`captions[${i}].text must be a string`);
      if (typeof c.start !== 'number') errors.push(`captions[${i}].start must be a number`);
      if (typeof c.end   !== 'number') errors.push(`captions[${i}].end must be a number`);
    });
  }

  return errors;
}

// ── Single Claude call ────────────────────────────────────────────────────────
async function callClaude(topic) {
  const res = await postJSON(
    'api.anthropic.com',
    '/v1/messages',
    {
      'x-api-key':         cfg.CLAUDE_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages:   [{ role: 'user', content: buildPrompt(topic) }],
    }
  );

  if (res.status !== 200) {
    throw new Error(`Claude API error ${res.status}: ${res.body.slice(0, 200)}`);
  }

  const data  = JSON.parse(res.body);
  const raw   = data.content[0].text.trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude returned no JSON object');
  return { parsed: JSON.parse(match[0]), raw };
}

// ── Main export ───────────────────────────────────────────────────────────────
async function generateScript(topic, outDir) {
  log.info(`ScriptGenerator: generating script for topic: "${topic.slice(0, 80)}"`);

  let result;

  // First attempt
  try {
    result = await callClaude(topic);
    log.info('ScriptGenerator: Claude responded, parsing JSON...');
  } catch (e) {
    log.error('ScriptGenerator attempt 1 failed: ' + e.message);
    throw e;
  }

  // Validate — retry once on failure
  let errors = validateScript(result.parsed);
  if (errors.length > 0) {
    log.warn('ScriptGenerator: validation failed (' + errors.join(', ') + '), retrying...');
    try {
      result = await callClaude(topic);
      errors  = validateScript(result.parsed);
    } catch (e) {
      log.error('ScriptGenerator retry failed: ' + e.message);
      throw e;
    }
  }

  // Still invalid after retry — save raw and abort
  if (errors.length > 0) {
    const rawPath = path.join(outDir, 'raw_claude_response.txt');
    fs.writeFileSync(rawPath, result.raw, 'utf8');
    log.error('ScriptGenerator: JSON still invalid after retry — ' + errors.join(', '));
    log.error('Raw response saved to: ' + rawPath);
    throw new Error('Script validation failed: ' + errors.join(', '));
  }

  // Save script.json
  const scriptPath = path.join(outDir, 'script.json');
  fs.writeFileSync(scriptPath, JSON.stringify(result.parsed, null, 2), 'utf8');

  log.ok(`ScriptGenerator: script.json saved`);
  log.ok(`  Title:    ${result.parsed.title}`);
  log.ok(`  Hook:     ${result.parsed.hook.slice(0, 60)}...`);
  log.ok(`  Facts:    ${result.parsed.facts.length}`);
  log.ok(`  Captions: ${result.parsed.captions.length}`);

  return { script: result.parsed, scriptPath };
}

module.exports = { generateScript };
