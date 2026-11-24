'use strict';
const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');
const cfg           = require('./config');
const log           = require('./utils/logger');
const { buildWordGroups, approxWordWidth } = require('./wordCaptionsBuilder');

const { W, H, FPS } = cfg.VIDEO;
const FB = cfg.FONTS.BOLD;
const FR = cfg.FONTS.REG;

// Escape Windows drive colon for FFmpeg filter files  (C:/ → C\:/)
const ep = p => p.replace(/^([A-Za-z]):/, '$1\\:');

// Write text to file, return escaped path for filter use
function tw(dir, name, text) {
  const p = path.join(dir, `${name}.txt`).replace(/\\/g, '/');
  fs.writeFileSync(p, text, 'utf8');
  return p;
}

// drawtext filter line — paths wrapped in 'C\:/...' format
function dt(font, file, size, color, x, y, extra) {
  const e = extra ? `:${extra}` : '';
  return `drawtext=fontfile='${ep(font)}':textfile='${ep(file)}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}:line_spacing=8${e}`;
}

// ── makeTestVideo ─────────────────────────────────────────────────────────────
// Creates a simple 10-second 1080×1920 test MP4 to verify the pipeline works.
function makeTestVideo(outDir) {
  log.info('VideoComposer: building test video...');

  const tmp = path.join(outDir, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  const tf = {
    title: tw(tmp, 'title', 'AI REELS MACHINE'),
    sub:   tw(tmp, 'sub',   'Milestone 1 — Pipeline Test'),
    ok:    tw(tmp, 'ok',    '✓ FFmpeg  ✓ Fonts  ✓ Output'),
    date:  tw(tmp, 'date',  new Date().toLocaleDateString('en-GB')),
  };

  const filters = [
    // background
    `drawbox=x=0:y=0:w=${W}:h=${H}:color=0x0a0a1a:t=fill`,
    // purple accent bar
    `drawbox=x=0:y=780:w=${W}:h=360:color=0x7c3aed@0.25:t=fill`,
    `drawbox=x=0:y=778:w=${W}:h=4:color=0x7c3aed:t=fill`,
    `drawbox=x=0:y=1138:w=${W}:h=4:color=0x7c3aed:t=fill`,
    // title
    dt(FB, tf.title, 88, '0xffffff',   '(w-tw)/2', '820'),
    // subtitle
    dt(FR, tf.sub,   38, '0xa78bfa',   '(w-tw)/2', '950'),
    // check line
    dt(FR, tf.ok,    32, '0x22c55e',   '(w-tw)/2', '1060'),
    // date bottom
    dt(FR, tf.date,  26, '0x64748b',   '(w-tw)/2', '1870'),
    // progress bar (animates 0→W over 10s)
    `drawbox=x=0:y=${H - 8}:w='iw*t/10':h=8:color=0x7c3aed@0.9:t=fill`,
  ];

  const filterGraph = `[0:v]${filters.join(',\n')}[vout]`;
  const filterFile  = path.join(tmp, 'filter.txt').replace(/\\/g, '/');
  fs.writeFileSync(filterFile, filterGraph, 'utf8');

  const outFile = path.join(outDir, 'test.mp4').replace(/\\/g, '/');

  const cmd = [
    'ffmpeg -y',
    `-f lavfi -i "color=c=0x0a0a1a:s=${W}x${H}:r=${FPS}:duration=10"`,
    `-filter_complex_script "${filterFile}"`,
    `-map "[vout]"`,
    `-c:v libx264 -preset fast -crf 23`,
    `-t 10`,
    `-movflags +faststart`,
    `"${outFile}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 60000 });
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().slice(-600) : e.message;
    try { fs.rmSync(tmp, { recursive: true }); } catch (_) {}
    throw new Error('FFmpeg failed:\n' + msg);
  }

  try { fs.rmSync(tmp, { recursive: true }); } catch (_) {}

  const sizeMB = (fs.statSync(outFile.replace(/\//g, '\\')).size / 1024 / 1024).toFixed(1);
  log.ok(`VideoComposer: test.mp4 created — ${sizeMB} MB`);
  return outFile;
}

// ── Text helpers ──────────────────────────────────────────────────────────────

// Wrap title at word boundary so it fits on screen at large font sizes
function wrapTitle(text) {
  if (text.length <= 22) return text;
  const words = text.split(' ');
  const mid   = Math.ceil(words.length / 2);
  return words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ');
}

// Wrap caption lines at word boundary
function wrapCap(text, max = 30) {
  if (text.length <= max) return text;
  const words = text.split(' ');
  let cur = '', out = [];
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > max && cur) { out.push(cur); cur = w; }
    else { cur = next; }
  }
  if (cur) out.push(cur);
  return out.join('\n');
}

// Build alpha fade-in/out expression for drawtext
function fadeAlpha(start, end, fd = 0.25) {
  const d  = Math.min(fd, (end - start) / 4);
  const fi = (start + d).toFixed(3);
  const fo = (end   - d).toFixed(3);
  return `if(lt(t,${fi}),(t-${start})/${d},if(lt(t,${fo}),1,(${end}-t)/${d}))`;
}

// ── Karaoke word-level subtitle filters ──────────────────────────────────────
function buildWordSubtitles(wordGroups, tmp) {
  const FS    = 60;
  const SPACE = Math.round(FS * 0.32);
  const Y     = '1520';
  const out   = [];

  wordGroups.forEach((group, gi) => {
    const { words, highlighted, start, end } = group;
    const fade   = fadeAlpha(start, end, 0.12);
    const enable = `between(t,${start.toFixed(3)},${end.toFixed(3)})`;

    if (words.length === 1) {
      const wf = tw(tmp, `wg${gi}w0`, words[0]);
      out.push(dt(FB, wf, FS, '0xffd700', '(w-tw)/2', Y,
        `shadowcolor=0x000000:shadowx=3:shadowy=3:alpha='${fade}':enable='${enable}'`));
      return;
    }

    const widths = words.map(w => approxWordWidth(w, FS));
    const total  = widths.reduce((a, b) => a + b, 0) + SPACE * (words.length - 1);
    let   x      = Math.max(24, Math.round((W - total) / 2));

    words.forEach((word, wi) => {
      const color = wi === highlighted ? '0xffd700' : '0xffffff';
      const wf    = tw(tmp, `wg${gi}w${wi}`, word);
      out.push(dt(FB, wf, FS, color, String(x), Y,
        `shadowcolor=0x000000:shadowx=3:shadowy=3:alpha='${fade}':enable='${enable}'`));
      x += widths[wi] + SPACE;
    });
  });

  return out;
}

// ── Shared text overlay chain (used by both gradient and clip paths) ──────────
function buildTextChain({ tf, wordSubFilters, dur, ctaStart, titleFade, ctaFade }) {
  return [
    `drawbox=x=0:y=0:w=iw:h=380:color=0x000000@0.38:t=fill`,
    `drawbox=x=0:y=1430:w=iw:h=490:color=0x000000@0.28:t=fill`,
    `drawbox=x=0:y=0:w=iw:h=6:color=0x6366f1:t=fill`,
    `drawbox=x=0:y=1914:w=iw:h=6:color=0x6366f1:t=fill`,
    `drawbox=x=0:y=1903:w=iw*t/${dur.toFixed(2)}:h=11:color=0x818cf8:t=fill`,
    dt(FB, tf.aiNews, 30, '0x818cf8', '(w-tw)/2', '152',
      `alpha='${titleFade}':enable='between(t,0,2.5)'`),
    dt(FB, tf.title,  72, '0xffffff', '(w-tw)/2', '200',
      `shadowcolor=0x000000:shadowx=5:shadowy=5:alpha='${titleFade}':enable='between(t,0,2.5)'`),
    ...wordSubFilters,
    `drawbox=x=(iw-360)/2:y=1648:w=360:h=3:color=0x6366f1@0.9:t=fill:enable='gte(t,${ctaStart})'`,
    dt(FB, tf.cta, 54, '0xffd700', '(w-tw)/2', '1672',
      `box=1:boxcolor=0x000000@0.82:boxborderw=24:shadowcolor=0x000000@0.9:shadowx=3:shadowy=3:alpha='${ctaFade}':enable='gte(t,${ctaStart})'`),
  ];
}

// ── makeReel ──────────────────────────────────────────────────────────────────
// clipPaths: array of local clip file paths from Pexels (optional)
// If empty, falls back to animated gradient background.
function makeReel({ title, cta, captions, wordGroups, voicePath, outDir, clipPaths = [] }) {
  log.info('VideoComposer: getting audio duration...');

  const voiceFixed = voicePath.replace(/\\/g, '/');
  const dur = parseFloat(
    execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${voiceFixed}"`,
      { encoding: 'utf8' }
    ).trim()
  );
  log.info(`VideoComposer: duration = ${dur.toFixed(2)}s`);

  const tmp = path.join(outDir, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  const tf = {
    aiNews: tw(tmp, 'ainews', 'AI NEWS'),
    title:  tw(tmp, 'title',  wrapTitle(title)),
    cta:    tw(tmp, 'cta',    cta),
  };
  const wGroups      = wordGroups || buildWordGroups(captions);
  const wordSubFilts = buildWordSubtitles(wGroups, tmp);
  const ctaStart     = Math.max(0, dur - 2).toFixed(2);
  const titleFade    = `if(lt(t,0.4),t/0.4,if(lt(t,2.1),1,(2.5-t)/0.4))`;
  const ctaFade      = `min((t-${ctaStart})/0.5,1)`;
  const textOverlay  = buildTextChain({ tf, wordSubFilters: wordSubFilts, dur, ctaStart, titleFade, ctaFade });

  const outFile    = path.join(outDir, 'final.mp4').replace(/\\/g, '/');
  const filterFile = path.join(tmp, 'filter.txt').replace(/\\/g, '/');

  let filterGraph, cmd;

  if (clipPaths.length === 0) {
    // ── FALLBACK: animated gradient background ─────────────────────────────
    log.info('VideoComposer: using gradient background (no clips)');

    const gradientBg = [
      `geq=r='10+8*sin(6.28*T/9)':g='3+3*sin(6.28*T/11)':b='32+28*sin(6.28*(X/540+T/7))'`,
      ...textOverlay,
    ];
    filterGraph = `[0:v]${gradientBg.join(',\n')}[vout]`;
    fs.writeFileSync(filterFile, filterGraph, 'utf8');

    cmd = [
      'ffmpeg -y',
      `-f lavfi -i "color=c=0x080818:s=${W}x${H}:r=${FPS}"`,
      `-i "${voiceFixed}"`,
      `-filter_complex_script "${filterFile}"`,
      `-map "[vout]" -map 1:a`,
      `-c:v libx264 -preset fast -crf 22`,
      `-c:a aac -b:a 192k`,
      `-t ${dur.toFixed(3)}`,
      `-movflags +faststart`,
      `"${outFile}"`,
    ].join(' ');

  } else {
    // ── PEXELS CLIPS: scale + crop + trim + concat → overlay text ─────────
    log.info(`VideoComposer: using ${clipPaths.length} Pexels clip(s) as background`);

    const n       = clipPaths.length;
    const segDur  = dur / n;

    // Per-clip: scale to portrait 1080x1920, loop-safe trim
    const clipFilters = clipPaths.map((_, i) => {
      const thisSeg = (i === n - 1)
        ? (dur - segDur * i).toFixed(3)
        : segDur.toFixed(3);
      return `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic,` +
             `crop=${W}:${H},setsar=1,` +
             `fps=${FPS},format=yuv420p,` +
             `trim=0:${thisSeg},setpts=PTS-STARTPTS,` +
             `eq=brightness=-0.12[c${i}]`;
    });

    const concatIn  = clipPaths.map((_, i) => `[c${i}]`).join('');
    const concatOut = `${concatIn}concat=n=${n}:v=1:a=0[bg]`;
    const overlayChain = `[bg]${textOverlay.join(',\n')}[vout]`;

    filterGraph = [...clipFilters, concatOut, overlayChain].join(';\n');
    fs.writeFileSync(filterFile, filterGraph, 'utf8');

    // Build inputs: each clip with stream_loop, then voice last
    const clipInputs = clipPaths
      .map(p => `-stream_loop -1 -i "${p.replace(/\\/g, '/')}"`)
      .join(' ');
    const audioIdx = clipPaths.length;

    cmd = [
      'ffmpeg -y',
      clipInputs,
      `-i "${voiceFixed}"`,
      `-filter_complex_script "${filterFile}"`,
      `-map "[vout]" -map ${audioIdx}:a`,
      `-c:v libx264 -preset fast -crf 22`,
      `-c:a aac -b:a 192k`,
      `-t ${dur.toFixed(3)}`,
      `-movflags +faststart`,
      `"${outFile}"`,
    ].join(' ');
  }

  log.info('VideoComposer: encoding with FFmpeg...');
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 300000 });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().slice(-1000) : e.message;
    try { fs.rmSync(tmp, { recursive: true }); } catch (_) {}
    throw new Error('FFmpeg failed:\n' + stderr);
  }

  try { fs.rmSync(tmp, { recursive: true }); } catch (_) {}

  const sizeMB = (fs.statSync(outFile.replace(/\//g, '\\')).size / 1024 / 1024).toFixed(1);
  log.ok(`VideoComposer: final.mp4 created — ${sizeMB} MB`);
  return { videoPath: outFile, duration: dur, sizeMB, usedFallback: clipPaths.length === 0 };
}

module.exports = { makeTestVideo, makeReel };
