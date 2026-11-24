'use strict';
const https = require('https');
const fs    = require('fs');
const cfg   = require('./config');
const log   = require('./utils/logger');

function sendVideo(filePath, caption) {
  return new Promise((resolve, reject) => {
    const token    = cfg.TG_TOKEN;
    const chatId   = cfg.TG_CHAT_ID;
    const fileData = fs.readFileSync(filePath);
    const boundary = '----ReelsBoundary' + Date.now();
    const cap      = caption || '🤖 AI Reels Machine';

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${cap}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="reel.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${token}/sendVideo`,
      method:   'POST',
      headers:  {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const r = JSON.parse(d);
        if (r.ok) { log.ok('Telegram: video sent'); resolve(r); }
        else       { reject(new Error('Telegram: ' + r.description)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendAudio(filePath, caption) {
  return new Promise((resolve, reject) => {
    const token    = cfg.TG_TOKEN;
    const chatId   = cfg.TG_CHAT_ID;
    const fileData = fs.readFileSync(filePath);
    const boundary = '----ReelsBoundary' + Date.now();
    const cap      = caption || '🎙 AI Reels Machine — voice.mp3';

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${cap}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${token}/sendAudio`,
      method:   'POST',
      headers:  {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const r = JSON.parse(d);
        if (r.ok) { log.ok('Telegram: audio sent'); resolve(r); }
        else       { reject(new Error('Telegram sendAudio: ' + r.description)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendDocument(filePath, caption) {
  return new Promise((resolve, reject) => {
    const token    = cfg.TG_TOKEN;
    const chatId   = cfg.TG_CHAT_ID;
    const fileData = fs.readFileSync(filePath);
    const fileName = require('path').basename(filePath);
    const boundary = '----ReelsBoundary' + Date.now();
    const cap      = caption || '📄 AI Reels Machine — document';

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${cap}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${token}/sendDocument`,
      method:   'POST',
      headers:  {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const r = JSON.parse(d);
        if (r.ok) { log.ok('Telegram: document sent'); resolve(r); }
        else       { reject(new Error('Telegram sendDocument: ' + r.description)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendVideo, sendAudio, sendDocument };
