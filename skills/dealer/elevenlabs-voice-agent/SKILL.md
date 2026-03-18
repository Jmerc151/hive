---
name: ElevenLabs Voice Agent
slug: elevenlabs-voice-agent
description: Text-to-speech synthesis for voice outreach, product demos, and audio content. Converts Dealer's written messages into natural-sounding voice.
version: 1.0.0
author: hive
agents: ["dealer"]
tags: ["voice", "tts", "audio", "elevenlabs", "outreach"]
source: clawhub-adapted
requires_env: ["ELEVENLABS_API_KEY"]
requires_tools: ["http_request", "write_file"]
---

# ElevenLabs Voice Agent

Convert text to natural-sounding speech for product demos, outreach follow-ups, and audio content.

## Status: NOT YET CONNECTED

ElevenLabs API key (`ELEVENLABS_API_KEY`) is not yet configured. This skill defines the patterns for when it gets connected.

## Use Cases

### Product Demo Narration
Generate voice-over for Ember and AgentForge product demo videos.

### Audio Content
Convert Quill's blog posts into podcast-style audio for broader distribution.

### Voice Messages
Create personalized voice messages for high-value outreach (when appropriate).

## API Integration Pattern

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
Headers:
  xi-api-key: {ELEVENLABS_API_KEY}
  Content-Type: application/json

Body:
{
  "text": "Your text here",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true
  }
}

Response: audio/mpeg binary stream
```

## Voice Selection

| Use Case | Voice Style | Settings |
|----------|------------|----------|
| Product demo | Professional, warm | stability: 0.7, similarity: 0.8 |
| Blog narration | Conversational, clear | stability: 0.5, similarity: 0.75 |
| Voice message | Friendly, personal | stability: 0.4, similarity: 0.7 |

## Text Preparation

Before sending to TTS:

1. **Clean the text** — Remove markdown formatting, links, code blocks
2. **Add pauses** — Insert `...` for natural pauses between sections
3. **Phonetic hints** — Spell out acronyms: "SaaS" → "sass", "API" → "A P I"
4. **Length check** — Max 5000 characters per request (API limit)
5. **Split long content** — Break into chunks at paragraph boundaries

## Output Format

Save generated audio as:
```
audio/{purpose}/{date}-{slug}.mp3
```

Example: `audio/demos/2026-03-18-ember-kitchen-bible.mp3`

## Cost Control

- ElevenLabs free tier: 10,000 characters/month
- Paid tiers start at $5/month for 30,000 characters
- Average blog post narration: ~5,000 characters
- **Budget**: Max 2 audio generations per day until paid tier justified by revenue

## Guardrails

- **No impersonation** — Never clone real people's voices
- **No deceptive content** — Audio must clearly be from Hive/Ember/AgentForge
- **Rate limit** — Max 2 generations per day
- **Quality check** — Always review generated audio before distributing
- **Disclosure** — Any published audio must note "AI-generated narration"
