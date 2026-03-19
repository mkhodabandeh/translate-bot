# 🌐 Telegram Translate Bot

A Telegram bot that translates messages in any group chat. Reply to a message with `/translate` and the bot will translate it using Google Translate with automatic source language detection.

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token you receive

### 2. Configure the Bot

```bash
cp .env.example .env
```

Edit `.env` and paste your bot token:

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 3. Install & Run

```bash
npm install
npm start
```

### 4. Add to a Group

1. Open your bot in Telegram (search by the username you chose in BotFather)
2. Add it to any group
3. **Important**: Go to BotFather, send `/mybots` → select your bot → **Bot Settings** → **Group Privacy** → set to **Disabled** so the bot can read messages it's replying to

## Commands

| Command                  | Description                           |
| ------------------------ | ------------------------------------- |
| `/translate`             | Translate replied message to English  |
| `/translate to farsi`    | Translate to a specific language      |
| `/translate to spanish`  | Works with any language name          |
| `/tr`                    | Short alias for `/translate`          |
| `/tr to french`          | Short alias with language target      |

> **Note:** You must **reply** to a message for the translation to work.

## Environment Variables

| Variable              | Required | Default | Description                      |
| --------------------- | -------- | ------- | -------------------------------- |
| `TELEGRAM_BOT_TOKEN`  | ✅       | —       | Your bot token from BotFather    |
| `DEFAULT_LANGUAGE`    | —        | `en`    | Default target language ISO code |

## Supported Languages

The bot supports 90+ languages including: Arabic, Chinese, Dutch, English, Farsi/Persian, French, German, Hindi, Italian, Japanese, Korean, Portuguese, Russian, Spanish, Turkish, Urdu, and many more.

You can also use ISO 639-1 codes directly (e.g., `/translate to fa`).
