require('dotenv').config();
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('google-translate-api-x');
const { resolveLanguage, LANGUAGE_MAP } = require('./languages');

// ── Health-check server (keeps Render free tier alive) ──────────────
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🤖 Translate Bot is alive');
  })
  .listen(PORT, () => {
    console.log(`🏥  Health-check server listening on port ${PORT}`);
  });

// ── Config ──────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_TARGET = process.env.DEFAULT_LANGUAGE || 'en';

if (!BOT_TOKEN) {
  console.error('❌  TELEGRAM_BOT_TOKEN is not set. Copy .env.example → .env and add your token.');
  process.exit(1);
}

// ── Bot setup ───────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('🤖  Translate Bot is running…');

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse the text after /translate or /tr.
 * Accepted patterns:
 *   /translate                → target = default (en)
 *   /translate to farsi       → target = fa
 *   /translate farsi          → target = fa  (shorthand without "to")
 *   /translate to zh-TW       → target = zh-TW (ISO code)
 */
function parseTarget(text) {
  if (!text) return { target: DEFAULT_TARGET, raw: null };

  // Remove leading "to " if present
  const cleaned = text.replace(/^to\s+/i, '').trim();
  if (!cleaned) return { target: DEFAULT_TARGET, raw: null };

  const resolved = resolveLanguage(cleaned);
  if (resolved) return { target: resolved, raw: cleaned };

  return { target: null, raw: cleaned };
}

/**
 * Find a friendly name for an ISO code (for display purposes).
 */
function friendlyName(code) {
  const entry = Object.entries(LANGUAGE_MAP).find(([, v]) => v === code);
  return entry ? capitalize(entry[0]) : code;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Command handler ─────────────────────────────────────────────────
const COMMAND_REGEX = /^\/(translate|tr)(?:@\w+)?\s*(.*)?$/i;

bot.onText(COMMAND_REGEX, async (msg, match) => {
  const chatId = msg.chat.id;
  const commandArgs = (match[2] || '').trim();

  // Must be a reply to another message
  if (!msg.reply_to_message) {
    return bot.sendMessage(
      chatId,
      '💡 Reply to a message with /translate (or /tr) to translate it.\n\n' +
        'Examples:\n' +
        '• `/translate` — translate to English\n' +
        '• `/translate to farsi` — translate to Farsi\n' +
        '• `/tr to spanish` — translate to Spanish',
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  }

  const originalText = msg.reply_to_message.text || msg.reply_to_message.caption;

  if (!originalText) {
    return bot.sendMessage(
      chatId,
      '⚠️ The replied message has no text to translate.',
      { reply_to_message_id: msg.message_id }
    );
  }

  // Parse target language
  const { target, raw } = parseTarget(commandArgs);

  if (!target) {
    return bot.sendMessage(
      chatId,
      `❌ Unknown language: *${raw}*\n\nTry a language name like \`farsi\`, \`spanish\`, \`german\`, or an ISO code like \`fa\`, \`es\`, \`de\`.`,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  }

  try {
    const result = await translate(originalText, { to: target });

    const from = friendlyName(result.from.language.iso);
    const to = friendlyName(target);

    const response =
      `🌐 *Translation* (${from} → ${to}):\n\n` +
      `${result.text}`;

    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.reply_to_message.message_id,
    });
  } catch (err) {
    console.error('Translation error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Sorry, something went wrong with the translation. Please try again.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// ── Error handling ──────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

process.on('SIGINT', () => {
  console.log('\n👋  Bot stopped.');
  bot.stopPolling();
  process.exit(0);
});
