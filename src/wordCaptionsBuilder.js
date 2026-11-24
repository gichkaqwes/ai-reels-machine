'use strict';
const fs   = require('fs');
const path = require('path');

// Approximate pixel width of a word in Arial Bold at given font size
function approxWordWidth(word, fontSize) {
  let w = 0;
  for (const ch of word) {
    if ('Il1!|.,;:\'`"'.includes(ch)) w += fontSize * 0.23;
    else if ('MW'.includes(ch))        w += fontSize * 0.78;
    else if (ch >= 'A' && ch <= 'Z')  w += fontSize * 0.64;
    else                               w += fontSize * 0.52;
  }
  return Math.round(w);
}

// Split captions into 3-word karaoke groups with evenly distributed timing
function buildWordGroups(captions, groupSize = 3) {
  const groups = [];

  for (const cap of captions) {
    const words = cap.text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    const numGroups = Math.ceil(words.length / groupSize);
    const groupDur  = (cap.end - cap.start) / numGroups;

    for (let i = 0; i < numGroups; i++) {
      groups.push({
        words:       words.slice(i * groupSize, (i + 1) * groupSize),
        highlighted: 0,
        start:       parseFloat((cap.start + i * groupDur).toFixed(3)),
        end:         parseFloat((cap.start + (i + 1) * groupDur).toFixed(3)),
      });
    }
  }

  return groups;
}

function saveWordCaptions(captions, outDir) {
  const groups  = buildWordGroups(captions);
  const outPath = path.join(outDir, 'word_captions.json');
  fs.writeFileSync(outPath, JSON.stringify(groups, null, 2), 'utf8');
  return { groups, outPath };
}

module.exports = { buildWordGroups, saveWordCaptions, approxWordWidth };
