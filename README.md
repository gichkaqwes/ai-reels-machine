# AI Reels Machine

An automated pipeline that turns a topic into a finished vertical video (Reel / Short)
and delivers it to Telegram for review.

```
topic → AI script → AI voice-over → subtitles → stock clips → final MP4 → Telegram
```

## Pipeline

| Step | Module | Tools |
|---|---|---|
| Script | `scriptGenerator.js` | Claude API |
| Voice-over | `voiceGenerator.js` | ElevenLabs TTS |
| Subtitles (SRT, karaoke-style word highlight) | `subtitleGenerator.js`, `wordCaptionsBuilder.js` | — |
| B-roll | `pexelsFetcher.js` | Pexels API |
| Render 1080×1920 | `videoComposer.js` | ffmpeg |
| Review pack + delivery | `reviewPack.js`, `telegramSender.js` | Telegram Bot API |

## Run

```bash
npm install
cp .env.example .env     # add your API keys
node src/index.js --test # pipeline smoke test
node src/index.js        # full reel
```

Requires ffmpeg in PATH. Built milestone by milestone with AI coding agents (Claude Code).
