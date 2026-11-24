'use strict';
const path = require('path');
const fs   = require('fs');
const log  = require('./utils/logger');
const { makeOutputDir }  = require('./utils/fileUtils');
const { makeTestVideo, makeReel } = require('./videoComposer');
const { sendVideo, sendAudio, sendDocument } = require('./telegramSender');
const { generateScript } = require('./scriptGenerator');
const { generateVoice }       = require('./voiceGenerator');
const { generateSubtitles }   = require('./subtitleGenerator');
const { createReviewPack }    = require('./reviewPack');
const { fetchClips }          = require('./pexelsFetcher');

// ── Milestone 1: pipeline test ────────────────────────────────────────────────
async function runTest() {
  log.info('=== AI REELS MACHINE — Milestone 1 Test ===');

  const outDir = makeOutputDir('milestone-1-test');
  log.info('Output folder: ' + outDir);

  let videoPath;
  try {
    videoPath = makeTestVideo(outDir);
  } catch (e) {
    log.error('Video generation failed: ' + e.message);
    process.exit(1);
  }

  try {
    await sendVideo(videoPath, '🧪 AI Reels Machine — Milestone 1 Test\n✅ FFmpeg pipeline working');
  } catch (e) {
    log.error('Telegram failed: ' + e.message);
    log.warn('Video saved locally at: ' + videoPath);
    process.exit(1);
  }

  log.ok('=== MILESTONE 1 COMPLETE ===');
  log.ok('Video: ' + videoPath);
}

// ── Milestone 2+3: topic → script.json → voice.mp3 ───────────────────────────
async function runScript(topic) {
  log.info('=== AI REELS MACHINE — Script Generation ===');
  log.info('Topic: ' + topic);

  const outDir = makeOutputDir(topic);
  log.info('Output folder: ' + outDir);

  let script, scriptPath;
  try {
    const result = await generateScript(topic, outDir);
    script     = result.script;
    scriptPath = result.scriptPath;
  } catch (e) {
    log.error('Script generation failed: ' + e.message);
    process.exit(1);
  }

  log.ok('=== MILESTONE 2 COMPLETE ===');
  log.ok('Script saved: ' + scriptPath);

  let voicePath;
  try {
    voicePath = await generateVoice(script.voiceover, outDir);
  } catch (e) {
    log.error('Voice generation failed: ' + e.message);
    process.exit(1);
  }

  // Report file size and duration
  const { execSync } = require('child_process');
  const sizeBytes = require('fs').statSync(voicePath).size;
  const sizeKB    = (sizeBytes / 1024).toFixed(1);
  let duration    = 'unknown';
  try {
    duration = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${voicePath}"`,
      { encoding: 'utf8' }
    ).trim();
    duration = parseFloat(duration).toFixed(1) + 's';
  } catch (_) {}

  log.ok('Voice file: ' + voicePath);
  log.ok('Voice size: ' + sizeKB + ' KB');
  log.ok('Voice duration: ' + duration);

  // Send voice.mp3 to Telegram for manual review
  log.info('Sending voice.mp3 to Telegram for review...');
  const caption = `🎙 Voice ready for review\n\nTopic: ${topic}\nDuration: ${duration}\nSize: ${sizeKB} KB\n\nApprove → send Milestone 4 requirements\nReject → send new topic`;
  try {
    await sendAudio(voicePath, caption);
  } catch (e) {
    log.error('Telegram send failed: ' + e.message);
    process.exit(1);
  }

  log.ok('=== MILESTONE 3 COMPLETE ===');
  log.ok('voice.mp3 sent to Telegram — approved, continuing to Milestone 4.');

  // Milestone 4: captions → subtitles.srt
  let srtPath;
  try {
    srtPath = await generateSubtitles(script.captions, outDir);
  } catch (e) {
    log.error('Subtitle generation failed: ' + e.message);
    process.exit(1);
  }

  // Send subtitles.srt to Telegram
  log.info('Sending subtitles.srt to Telegram for review...');
  const srtCaption = `📄 Subtitles ready for review\n\nTopic: ${topic}\nCaptions: ${script.captions.length}\nSpan: ${script.captions[0].start}s → ${script.captions[script.captions.length - 1].end}s\n\nApprove → send Milestone 5 requirements\nReject → adjust captions in script.json`;
  try {
    await sendDocument(srtPath, srtCaption);
  } catch (e) {
    log.error('Telegram send failed: ' + e.message);
    process.exit(1);
  }

  log.ok('=== MILESTONE 4 COMPLETE ===');
  log.ok('subtitles.srt sent to Telegram — approved, continuing to Milestone 5.');

  // Milestone 7: build word-level karaoke captions
  const { saveWordCaptions } = require('./wordCaptionsBuilder');
  let wordGroups = null, wordCaptionsPath = null;
  try {
    const wc = saveWordCaptions(script.captions, outDir);
    wordGroups      = wc.groups;
    wordCaptionsPath = wc.outPath;
    log.ok(`WordCaptions: ${wordGroups.length} groups saved → word_captions.json`);
  } catch (e) {
    log.warn('WordCaptions: failed — ' + e.message);
  }

  // Fetch Pexels clips — fallback to [] on any failure
  const clipsDir = require('path').join(outDir, 'clips');
  let clipPaths  = [];
  let pexelsMeta = { keywords: [], clips: [], keywordsPath: null };
  try {
    const result = await fetchClips(script, topic, clipsDir);
    clipPaths  = result.clips.map(c => c.path);
    pexelsMeta = result;
  } catch (e) {
    log.warn('PexelsFetcher: failed, using gradient fallback — ' + e.message);
  }

  // Send pexels_keywords.json to Telegram for review
  if (pexelsMeta.keywordsPath) {
    log.info('Sending pexels_keywords.json to Telegram...');
    const kwCaption = `🔍 Pexels keywords\n\nTopic: ${topic}\nPhrases: ${pexelsMeta.keywords.join(' | ')}\nClips downloaded: ${clipPaths.length}`;
    try {
      await sendDocument(pexelsMeta.keywordsPath, kwCaption);
    } catch (e) {
      log.warn('Could not send pexels_keywords.json: ' + e.message);
    }
  }

  // Milestone 5: compose final.mp4
  let videoResult;
  try {
    videoResult = makeReel({
      title:      script.title,
      cta:        script.cta,
      captions:   script.captions,
      wordGroups,
      voicePath,
      outDir,
      clipPaths,
    });
  } catch (e) {
    log.error('Video generation failed: ' + e.message);
    process.exit(1);
  }

  log.ok(`Video size: ${videoResult.sizeMB} MB`);
  log.ok(`Video duration: ${videoResult.duration.toFixed(1)}s`);

  // Send final.mp4 to Telegram
  log.info('Sending final.mp4 to Telegram for review...');
  const bgInfo      = videoResult.usedFallback
    ? 'Background: gradient fallback (no clips)'
    : `Background: ${clipPaths.length} Pexels clip(s) — see pexels_keywords.json`;
  const videoCaption = `🎬 Reel ready for review\n\nTopic: ${topic}\nDuration: ${videoResult.duration.toFixed(1)}s\nSize: ${videoResult.sizeMB} MB\n${bgInfo}\n\nApprove → next milestone\nReject → fix and rerun`;
  try {
    await sendVideo(videoResult.videoPath, videoCaption);
  } catch (e) {
    log.error('Telegram send failed: ' + e.message);
    process.exit(1);
  }

  // Send word_captions.json (Milestone 7)
  if (wordCaptionsPath) {
    log.info('Sending word_captions.json to Telegram...');
    try {
      await sendDocument(wordCaptionsPath, `🎤 Word captions (karaoke)\n\nTopic: ${topic}\nGroups: ${wordGroups ? wordGroups.length : 0}\nStyle: 3-word groups, first word yellow`);
    } catch (e) {
      log.warn('Could not send word_captions.json: ' + e.message);
    }
  }

  log.ok('=== MILESTONE 5+7 COMPLETE ===');
  log.ok('final.mp4 + word_captions.json sent to Telegram — continuing to Review Pack.');

  // Review Pack: script_en.txt + script_ru.txt + review_summary.txt
  let reviewFiles;
  try {
    reviewFiles = await createReviewPack({
      topic,
      script,
      duration: videoResult.duration,
      outDir,
    });
  } catch (e) {
    log.error('Review Pack failed: ' + e.message);
    process.exit(1);
  }

  log.info('Sending review files to Telegram...');
  try {
    await sendDocument(reviewFiles.enPath,  '📝 English voiceover script');
    await sendDocument(reviewFiles.ruPath,  '📝 Русский перевод озвучки');
    await sendDocument(reviewFiles.sumPath, '📋 Review summary');
  } catch (e) {
    log.error('Telegram send failed: ' + e.message);
    process.exit(1);
  }

  log.ok('=== REVIEW PACK COMPLETE ===');
  log.ok('script_en.txt + script_ru.txt + review_summary.txt sent to Telegram.');
  log.ok('All files saved in: ' + outDir);
  log.info('Stop. Waiting for manual approval.');
}

// ── Entry point ───────────────────────────────────────────────────────────────
const args  = process.argv.slice(2);
const topic = args.find(a => !a.startsWith('--'));

if (args.includes('--test')) {
  runTest().catch(e => { log.error(e.message); process.exit(1); });
} else if (topic) {
  runScript(topic).catch(e => { log.error(e.message); process.exit(1); });
} else {
  log.info('Usage:');
  log.info('  node src/index.js --test');
  log.info('  node src/index.js "your topic here"');
}
