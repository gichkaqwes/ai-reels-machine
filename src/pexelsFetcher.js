'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const cfg   = require('./config');
const log   = require('./utils/logger');

// Map topic words → semantic visual phrases for Pexels
const PHRASE_MAP = [
  { match: /\bgoogle\b/i,                    phrases: ['google office workspace', 'data center server room', 'artificial intelligence computer'] },
  { match: /\bapple\b/i,                     phrases: ['apple laptop macbook', 'smartphone screen technology', 'silicon microchip processor'] },
  { match: /\bmicrosoft\b/i,                 phrases: ['cloud computing servers', 'software developer coding', 'business technology office'] },
  { match: /\bopenai\b|\bchatgpt\b/i,        phrases: ['artificial intelligence robot', 'futuristic hologram interface', 'machine learning neural network'] },
  { match: /\bmeta\b|\bfacebook\b/i,         phrases: ['virtual reality headset', 'augmented reality technology', 'social network connection'] },
  { match: /\btesla\b/i,                     phrases: ['electric vehicle charging', 'autonomous self driving car', 'futuristic car technology'] },
  { match: /\bnvidia\b/i,                    phrases: ['gpu graphics card chip', 'data center server room', 'artificial intelligence processor'] },
  { match: /\bamazon\b|\baws\b/i,            phrases: ['cloud server data center', 'warehouse delivery robot', 'e-commerce technology'] },
  { match: /\bvideo\s*model\b|\bvideo\s*gen/i, phrases: ['video editing studio filmmaker', 'digital cinema production', 'creative media screen'] },
  { match: /\brobots?\b|\brobotics\b/i,       phrases: ['industrial robot automation factory', 'robotic arm warehouse', 'artificial intelligence robot'] },
  { match: /\bwarehouse\b|\bworker\b/i,       phrases: ['warehouse logistics automation', 'factory assembly line robot', 'industrial robot automation'] },
  { match: /\bchip\b|\bsemiconductor\b/i,   phrases: ['microchip circuit board', 'semiconductor silicon wafer', 'technology processor'] },
  { match: /\bspace\b|\bnasa\b/i,            phrases: ['space rocket launch', 'satellite orbit earth', 'astronaut space station'] },
  { match: /\bcyber\b|\bsecurity\b/i,        phrases: ['cybersecurity digital screen', 'hacker code blue light', 'digital security network'] },
  { match: /\bphone\b|\bsmartphone\b/i,      phrases: ['smartphone screen closeup', 'mobile app interface', 'wireless communication technology'] },
  { match: /\bcrypto\b|\bbitcoin\b/i,        phrases: ['cryptocurrency bitcoin trading', 'blockchain digital finance', 'digital currency technology'] },
  { match: /\bai\b|\bartificial intelligence/i, phrases: ['artificial intelligence technology', 'robot automation futuristic', 'machine learning data visualization'] },
  { match: /\bmodel\b|\brelease\b|\blaunch\b/i, phrases: ['technology product launch event', 'software development innovation', 'digital screen interface'] },
];

const FALLBACK_PHRASES = [
  'artificial intelligence technology',
  'data center server room',
  'futuristic digital interface',
  'software developer coding screen',
];

// Build up to 4 visual search phrases from topic string
function extractPhrases(topic) {
  const phrases = [];
  const seen    = new Set();

  for (const { match, phrases: pool } of PHRASE_MAP) {
    if (!match.test(topic)) continue;
    for (const ph of pool) {
      if (phrases.length >= 4) break;
      if (!seen.has(ph)) { seen.add(ph); phrases.push(ph); }
    }
    if (phrases.length >= 4) break;
  }

  for (const ph of FALLBACK_PHRASES) {
    if (phrases.length >= 4) break;
    if (!seen.has(ph)) { seen.add(ph); phrases.push(ph); }
  }

  return phrases.slice(0, 4);
}

// Search Pexels Videos API — returns array of video objects
async function searchPexels(phrase) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(phrase);
    const req = https.request(
      {
        hostname: 'api.pexels.com',
        path:     `/videos/search?query=${query}&orientation=portrait&size=medium&per_page=5`,
        method:   'GET',
        headers:  { Authorization: cfg.PEXELS_KEY },
      },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Pexels API ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()).videos || []);
          } catch (e) {
            reject(new Error('Pexels: failed to parse response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Pick best portrait mp4 file from a Pexels video result
function pickBestFile(video) {
  const files = (video.video_files || [])
    .filter(f => f.file_type === 'video/mp4' && f.link)
    .sort((a, b) => b.height - a.height);

  return files.find(f => f.height > f.width) || files[0] || null;
}

// Download file from URL to destPath — follows one redirect
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (urlStr) => {
      const u = new URL(urlStr);
      const opts = {
        hostname: u.hostname,
        path:     u.pathname + u.search,
        headers:  { 'User-Agent': 'Mozilla/5.0' },
      };
      https.get(opts, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download HTTP ${res.statusCode} from ${u.hostname}`));
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// Main export: search + download up to 4 clips, save pexels_keywords.json
async function fetchClips(script, topic, clipsDir) {
  fs.mkdirSync(clipsDir, { recursive: true });

  const phrases = extractPhrases(topic);
  log.info(`PexelsFetcher: phrases → [${phrases.join(' | ')}]`);

  const downloaded = [];

  for (const phrase of phrases) {
    if (downloaded.length >= 4) break;
    log.info(`PexelsFetcher: searching "${phrase}"...`);

    let videos;
    try {
      videos = await searchPexels(phrase);
    } catch (e) {
      log.warn(`PexelsFetcher: search failed for "${phrase}" — ${e.message}`);
      continue;
    }

    if (!videos.length) {
      log.warn(`PexelsFetcher: no results for "${phrase}"`);
      continue;
    }

    for (const video of videos) {
      if (downloaded.length >= 4) break;
      const file = pickBestFile(video);
      if (!file) continue;

      const destPath = path.join(clipsDir, `clip${downloaded.length}.mp4`);
      try {
        log.info(`PexelsFetcher: downloading clip${downloaded.length} (${file.width}x${file.height})...`);
        await downloadFile(file.link, destPath);
        const sizeMB = (fs.statSync(destPath).size / 1024 / 1024).toFixed(1);
        log.ok(`PexelsFetcher: clip${downloaded.length}.mp4 saved — ${sizeMB} MB`);
        downloaded.push({ path: destPath, phrase, width: file.width, height: file.height });
        break;
      } catch (e) {
        log.warn(`PexelsFetcher: download failed — ${e.message}`);
        try { fs.unlinkSync(destPath); } catch (_) {}
      }
    }
  }

  // Save keywords metadata to parent of clipsDir (outDir)
  const keywordsPath = path.join(clipsDir, '..', 'pexels_keywords.json');
  const meta = {
    topic,
    phrases,
    clipsDownloaded: downloaded.length,
    clips: downloaded.map(d => ({
      file:       path.basename(d.path),
      phrase:     d.phrase,
      resolution: `${d.width}x${d.height}`,
    })),
  };
  fs.writeFileSync(keywordsPath, JSON.stringify(meta, null, 2), 'utf8');
  log.ok(`PexelsFetcher: ${downloaded.length} clip(s) ready — keywords saved`);

  return { clips: downloaded, keywords: phrases, keywordsPath };
}

module.exports = { fetchClips };
