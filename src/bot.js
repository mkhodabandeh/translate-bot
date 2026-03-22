require('dotenv').config();
const http = require('http');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');
const translate = require('baidu-translate-api');
const { resolveLanguage, CODE_TO_NAME } = require('./languages');
const { transcribe } = require('./stt');

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

console.log('🤖  Translate Bot is running… (Baidu Translate)');

// ── Register command menu with Telegram ─────────────────────────────
bot.setMyCommands([
  { command: 'translate', description: 'Reply to a message to translate it' },
  { command: 'tr', description: 'Short alias for /translate' },
  { command: 'transcribe', description: 'Reply to a voice message to transcribe it' },
  { command: 'auto', description: 'Auto-translate forwarded messages (e.g. /auto to chinese)' },
  { command: 'autooff', description: 'Turn off auto-translate' },
]);

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse the text after /translate or /tr.
 * Accepted patterns:
 *   /translate                → target = default (en)
 *   /translate to chinese     → target = zh
 *   /translate french         → target = fra  (shorthand without "to")
 *   /translate to kor         → target = kor (Baidu code)
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
 * Find a friendly name for a Baidu language code (for display purposes).
 */
function friendlyName(code) {
  const name = CODE_TO_NAME[code];
  return name ? capitalize(name) : code;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Download a file from Telegram's servers and return it as a Buffer.
 */
async function downloadTelegramFile(fileId) {
  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
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
        '• `/translate to chinese` — translate to Chinese\n' +
        '• `/tr to spanish` — translate to Spanish',
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  }

  const replied = msg.reply_to_message;
  const originalText = replied.text || replied.caption
    || (replied.poll && replied.poll.question)
    || null;

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
      `❌ Unknown language: *${raw}*\n\nTry a language name like \`chinese\`, \`spanish\`, \`german\`, or a Baidu code like \`zh\`, \`spa\`, \`de\`.`,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  }

  try {
    const result = await translate(originalText, { to: target });

    const from = friendlyName(result.from);
    const to = friendlyName(target);

    const response =
      `🌐 *Translation* (${from} → ${to}):\n\n` +
      `${result.trans_result.dst}`;

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

// ── /transcribe command handler ─────────────────────────────────────
const TRANSCRIBE_REGEX = /^\/transcribe(?:@\w+)?\s*$/i;

bot.onText(TRANSCRIBE_REGEX, async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.reply_to_message) {
    return bot.sendMessage(
      chatId,
      '💡 Reply to a voice message with /transcribe to transcribe it.',
      { reply_to_message_id: msg.message_id }
    );
  }

  const replied = msg.reply_to_message;
  const voice = replied.voice || replied.audio || replied.video_note;

  if (!voice) {
    return bot.sendMessage(
      chatId,
      '⚠️ The replied message is not a voice/audio message.',
      { reply_to_message_id: msg.message_id }
    );
  }

  try {
    await bot.sendChatAction(chatId, 'typing');
    const audioBuffer = await downloadTelegramFile(voice.file_id);
    const { text } = await transcribe(audioBuffer, 'voice.oga');

    if (!text || text.trim().length === 0) {
      return bot.sendMessage(
        chatId,
        '⚠️ Could not transcribe — no speech detected.',
        { reply_to_message_id: replied.message_id }
      );
    }

    await bot.sendMessage(
      chatId,
      `🎤 *Transcription:*\n\n${text}`,
      { parse_mode: 'Markdown', reply_to_message_id: replied.message_id }
    );
  } catch (err) {
    console.error('Transcription error:', err);
    await bot.sendMessage(
      chatId,
      '❌ Sorry, something went wrong with the transcription.',
      { reply_to_message_id: msg.message_id }
    );
  }
});

// ── Per-chat auto-translate state ───────────────────────────────────
// Map<chatId, { target: string }>  — only present when auto mode is ON
const autoTranslateChats = new Map();

// ── /auto command handler ───────────────────────────────────────────
const AUTO_REGEX = /^\/auto(?:@\w+)?\s*(.*)?$/i;

bot.onText(AUTO_REGEX, async (msg, match) => {
  const chatId = msg.chat.id;
  const commandArgs = (match[1] || '').trim();

  const { target, raw } = parseTarget(commandArgs);

  if (!target) {
    return bot.sendMessage(
      chatId,
      `❌ Unknown language: *${raw}*\n\nTry: \`/auto to chinese\`, \`/auto spanish\`, \`/auto de\``,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
    );
  }

  autoTranslateChats.set(chatId, { target });
  const to = friendlyName(target);

  await bot.sendMessage(
    chatId,
    `✅ Auto-translate is *ON*\n\nForwarded messages will be translated to *${to}*.\nUse /autooff to disable.`,
    { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
  );
});

// ── /autooff command handler ────────────────────────────────────────
const AUTOOFF_REGEX = /^\/autooff(?:@\w+)?\s*$/i;

bot.onText(AUTOOFF_REGEX, async (msg) => {
  const chatId = msg.chat.id;

  if (!autoTranslateChats.has(chatId)) {
    return bot.sendMessage(
      chatId,
      '💡 Auto-translate is already off.',
      { reply_to_message_id: msg.message_id }
    );
  }

  autoTranslateChats.delete(chatId);
  await bot.sendMessage(
    chatId,
    '🔴 Auto-translate is *OFF*',
    { parse_mode: 'Markdown', reply_to_message_id: msg.message_id }
  );
});

// ── Auto-translate/transcribe forwarded messages ────────────────────
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Only handle forwarded messages
  if (!msg.forward_date) return;

  // Skip commands
  if (msg.text && (COMMAND_REGEX.test(msg.text) || AUTO_REGEX.test(msg.text) || TRANSCRIBE_REGEX.test(msg.text))) return;

  // ── Auto-transcribe forwarded voice messages ──────────────────────
  const voice = msg.voice || msg.audio || msg.video_note;
  if (voice) {
    try {
      await bot.sendChatAction(chatId, 'typing');
      const audioBuffer = await downloadTelegramFile(voice.file_id);
      const { text } = await transcribe(audioBuffer, 'voice.oga');

      if (!text || text.trim().length === 0) return;

      let response = `🎤 *Transcription:*\n\n${text}`;

      // If auto-translate is on, also translate the transcription
      const autoConfig = autoTranslateChats.get(chatId);
      if (autoConfig) {
        try {
          const result = await translate(text, { to: autoConfig.target });
          if (result.from !== autoConfig.target) {
            const from = friendlyName(result.from);
            const to = friendlyName(autoConfig.target);
            response += `\n\n🌐 *Translation* (${from} → ${to}):\n\n${result.trans_result.dst}`;
          }
        } catch (translateErr) {
          console.error('Auto-translate after transcription error:', translateErr);
        }
      }

      await bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_to_message_id: msg.message_id,
      });
    } catch (err) {
      console.error('Auto-transcribe error:', err);
    }
    return;
  }

  // ── Auto-translate forwarded text messages ─────────────────────────
  const autoConfig = autoTranslateChats.get(chatId);
  if (!autoConfig) return;

  const originalText = msg.text || msg.caption;
  if (!originalText || originalText.length < 2) return;

  try {
    const result = await translate(originalText, { to: autoConfig.target });

    // Don't translate if already in the target language
    if (result.from === autoConfig.target) return;

    const from = friendlyName(result.from);
    const to = friendlyName(autoConfig.target);

    const response =
      `🌐 *Translation* (${from} → ${to}):\n\n` +
      `${result.trans_result.dst}`;

    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id,
    });
  } catch (err) {
    console.error('Auto-translate error:', err);
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
