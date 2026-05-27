# ModMail Copilot

An AI assistant for Reddit moderators, built on Devvit for the **Reddit Mod Tools Hackathon 2026**.

## The problem

Reddit's volunteer mods donate millions of hours a year and pay for it with abuse — most of it arriving through modmail. They read every hostile message, every insult, every ban appeal personally. Burnout is the inevitable end state.

## What it does

When a user sends modmail, ModMail Copilot reads the conversation plus the sender's Reddit history, asks GPT-4o-mini to analyze it, and posts a **private, mods-only note** in the same thread with:

- **Classification** — ban appeal, rule question, harassment, spam, crisis, etc.
- **Severity flag** — 🟢 low / 🟡 med / 🔴 high
- **"Mod Shield"** — if the message is abusive, the note shows a calm summary instead of the raw toxic text, and the full mod team gets a notification
- **Drafted reply** — in the user's own language, matching tone, ready to copy / edit / send

**Critical: the app never replies to users automatically.** Every `modMail.reply()` call is `isInternal: true`. The human is always in the loop.

## Differentiators

1. **Rich Reddit-native signals** — account age, karma, mod-note history, karma-farm detection, posting-hour clustering (bot signal) — all fed to the LLM as context so drafts are smarter than generic templates.
2. **Mod Shield** — abuse detection + auto-escalation via `createModNotification()` to the full mod team on high-severity messages.
3. **Multi-language** — Claude detects the user's language and drafts in it. Spanish, French, German, Japanese — no extra config.
4. **Analytics dashboard** — a subreddit menu item generates a 7-day stats post showing volume by category and severity.
5. **Safety rails** — per-message idempotency, per-sub hourly rate limit (50/hr default), configurable daily USD budget cap. Cost is ~$0.0006 per modmail (gpt-4o-mini).

## Crisis handling

Self-harm or suicidal language is **never** auto-handled punitively. The draft points to support resources (988 in the US, findahelpline.com internationally) in the user's language, and the severity flag tells mods to review urgently.

## Settings (configurable in <2 minutes by any mod)

- `enabled` — kill switch
- `tone` — friendly / formal
- `rules` — paste your subreddit's rules so drafts reference them correctly
- `daily-budget-usd` — cap, default $1.00

The OpenAI API key is set once globally via `devvit settings set openai-api-key`.

## Architecture

Built on `@devvit/web` 0.12.24 (Devvit web architecture, Node HTTP server). Triggers and menu items dispatch via `src/server/server.ts`. LLM is OpenAI `gpt-4o-mini-2024-07-18` via the Chat Completions API with `response_format: { type: "json_object" }`. State is Devvit Redis.

```
src/server/
├── handlers/onModMail.ts   # main trigger handler
├── llm.ts                  # OpenAI client with defensive parsing
├── prompts.ts              # system + user prompts
├── history.ts              # Reddit-native user signals
├── cache.ts                # Redis: idempotency, rate limit, budget, history
└── analytics.ts            # daily counters + 7-day stats post
```

## Development

```bash
npm run dev        # playtest on the dev subreddit
npm run build      # compile
npm run type-check # tsc
npm run deploy     # build + upload
npm run launch     # build + upload + publish
```

Requires Node 22.6.0+ (per scaffold's `engines`).

## License

BSD-3-Clause. See LICENSE.
