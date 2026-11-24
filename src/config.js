'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

module.exports = {
  CLAUDE_KEY:      process.env.CLAUDE_KEY,
  ELEVEN_KEY:      process.env.ELEVEN_KEY,
  ELEVEN_VOICE_ID: process.env.ELEVEN_VOICE_ID || 'CwhRBWXzGAHq8TQ4Fs17',
  TG_TOKEN:        process.env.TG_TOKEN,
  TG_CHAT_ID:      process.env.TG_CHAT_ID,
  PEXELS_KEY:      process.env.PEXELS_KEY,

  VIDEO: {
    W:        1080,
    H:        1920,
    FPS:      30,
    DURATION: 37,
  },

  FONTS: {
    BOLD: 'C:/Windows/Fonts/arialbd.ttf',
    REG:  'C:/Windows/Fonts/arial.ttf',
  },
};
