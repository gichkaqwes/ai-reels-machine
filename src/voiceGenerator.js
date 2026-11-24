'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const cfg   = require('./config');
const log   = require('./utils/logger');

async function generateVoice(voiceover, outDir) {
  log.info('VoiceGenerator: calling ElevenLabs...');

  const voicePath = path.join(outDir, 'voice.mp3');
  const body      = Buffer.from(JSON.stringify({
    text:           voiceover,
    model_id:       'eleven_turbo_v2_5',
    voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
  }));

  await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        path:     `/v1/text-to-speech/${cfg.ELEVEN_VOICE_ID}`,
        method:   'POST',
        headers:  {
          'xi-api-key':    cfg.ELEVEN_KEY,
          'content-type':  'application/json',
          'accept':        'audio/mpeg',
          'Content-Length': body.length,
        },
      },
      res => {
        if (res.statusCode !== 200) {
          const chunks = [];
          res.on('data', d => chunks.push(d));
          res.on('end', () => reject(new Error(
            `ElevenLabs error ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 200)}`
          )));
          return;
        }
        const out = fs.createWriteStream(voicePath);
        res.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const size = fs.statSync(voicePath).size;
  log.ok(`VoiceGenerator: voice.mp3 saved (${(size / 1024).toFixed(1)} KB)`);
  return voicePath;
}

module.exports = { generateVoice };
