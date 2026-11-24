'use strict';
const fs   = require('fs');
const path = require('path');
const log  = require('./utils/logger');

// Convert seconds (number) to SRT timestamp: HH:MM:SS,mmm
function toSrtTime(seconds) {
  const ms  = Math.round((seconds % 1) * 1000);
  const s   = Math.floor(seconds) % 60;
  const m   = Math.floor(seconds / 60) % 60;
  const h   = Math.floor(seconds / 3600);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ',' +
    String(ms).padStart(3, '0')
  );
}

function validate(captions) {
  const errors = [];
  if (!Array.isArray(captions) || captions.length === 0) {
    errors.push('captions must be a non-empty array');
    return errors;
  }
  captions.forEach((c, i) => {
    if (typeof c.text  !== 'string' || c.text.trim() === '') errors.push(`[${i}] missing text`);
    if (typeof c.start !== 'number')                          errors.push(`[${i}] start must be a number`);
    if (typeof c.end   !== 'number')                          errors.push(`[${i}] end must be a number`);
    if (typeof c.start === 'number' && typeof c.end === 'number' && c.start >= c.end)
      errors.push(`[${i}] start (${c.start}) must be less than end (${c.end})`);
    if (i > 0 && typeof c.start === 'number' && typeof captions[i - 1].start === 'number') {
      if (c.start < captions[i - 1].start)
        errors.push(`[${i}] captions not ordered by time (start ${c.start} < previous ${captions[i - 1].start})`);
    }
  });
  return errors;
}

function buildSrt(captions) {
  return captions.map((c, i) =>
    `${i + 1}\n${toSrtTime(c.start)} --> ${toSrtTime(c.end)}\n${c.text.trim()}\n`
  ).join('\n') + '\n';
}

async function generateSubtitles(captions, outDir) {
  log.info('SubtitleGenerator: validating captions...');

  const errors = validate(captions);
  if (errors.length > 0) {
    errors.forEach(e => log.error('SubtitleGenerator: ' + e));
    throw new Error('Subtitle validation failed: ' + errors.join('; '));
  }

  log.ok(`SubtitleGenerator: ${captions.length} captions valid`);

  const srt     = buildSrt(captions);
  const srtPath = path.join(outDir, 'subtitles.srt');
  fs.writeFileSync(srtPath, srt, 'utf8');

  log.ok('SubtitleGenerator: subtitles.srt saved');
  log.ok('  Captions: ' + captions.length);
  log.ok('  Duration: ' + captions[0].start + 's → ' + captions[captions.length - 1].end + 's');

  return srtPath;
}

module.exports = { generateSubtitles };
