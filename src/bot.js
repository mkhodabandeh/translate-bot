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

console.log('🤖  Translate Bot is running… (Baidu Translate + Speechmatics)');

const BOT_VERSION = require('../package.json').version;

// ── Register command menu with Telegram ─────────────────────────────
bot.setMyCommands([
  { command: 'translate', description: 'Reply to a message to translate it' },
  { command: 'tr', description: 'Short alias for /translate' },
  { command: 'transcribe', description: 'Reply to a voice message to transcribe it' },
  { command: 'settings', description: 'Configure auto-translation and transcription' },
  { command: 'autotranslate', description: 'Auto-translate forwarded texts (e.g. /autotranslate to chinese)' },
  { command: 'autotranscribe', description: 'Auto-transcribe voice messages' },
  { command: 'autooff', description: 'Turn off all auto modes' },
  { command: 'version', description: 'Show bot version' },
]);

// ── /version command ────────────────────────────────────────────────
bot.onText(/^\/version(?:@\w+)?\s*$/i, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🤖 Translate Bot v${BOT_VERSION}`,
    { reply_to_message_id: msg.message_id });
});

// ── Dedup guard (prevents double-processing the same voice message) ─
const processedMessages = new Set();
function dedup(chatId, msgId, action) {
  const key = `${chatId}:${msgId}:${action}`;
  if (processedMessages.has(key)) return true;
  processedMessages.add(key);
  // Clean up after 5 minutes
  setTimeout(() => processedMessages.delete(key), 5 * 60 * 1000);
  return false;
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseTarget(text) {
  if (!text) return { target: DEFAULT_TARGET, raw: null };
  const cleaned = text.replace(/^to\s+/i, '').trim();
  if (!cleaned) return { target: DEFAULT_TARGET, raw: null };
  const resolved = resolveLanguage(cleaned);
  if (resolved) return { target: resolved, raw: cleaned };
  return { target: null, raw: cleaned };
}

function parseTranscribeTarget(text) {
  if (!text) return { target: 'fa', raw: null };
  const raw = text.trim().toLowerCase();
  const smMap = {
    farsi: 'fa', persian: 'fa', english: 'en', spanish: 'es',
    french: 'fr', german: 'de', italian: 'it', russian: 'ru',
    arabic: 'ar', chinese: 'zh', japanese: 'ja', korean: 'ko'
  };
  if (smMap[raw]) return { target: smMap[raw], raw };
  if (/^[a-z]{2}$/.test(raw)) return { target: raw, raw };
  return { target: null, raw };
}

function friendlyName(code) {
  if (code === 'fa') return 'Farsi';
  const name = CODE_TO_NAME[code];
  return name ? capitalize(name) : String(code || '').toUpperCase();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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

// ── /translate and /tr command ──────────────────────────────────────
const COMMAND_REGEX = /^\/(translate|tr(?![a-z]))(?:@\w+)?\s*(.*)?$/i;

bot.onText(COMMAND_REGEX, async (msg, match) => {
  const chatId = msg.chat.id;
  const commandArgs = (match[2] || '').trim();
  console.log(`[BOT] /translate handler fired — chat ${chatId}, msg ${msg.message_id}`);

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

  const { target, raw } = parseTarget(commandArgs);
  if (!target) {
    return bot.sendMessage(chatId,
      `❌ Unknown language: *${raw}*\n\nTry a language name like \`chinese\`, \`spanish\`, \`german\`, or a Baidu code like \`zh\`, \`spa\`, \`de\`.`,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
  }

  // If it's a voice message, transcribe first then translate
  const voice = replied.voice || replied.audio || replied.video_note;
  if (voice) {
    try {
      console.log('[BOT] /translate on voice message — transcribing first');
      await bot.sendChatAction(chatId, 'typing');
      const audioBuffer = await downloadTelegramFile(voice.file_id);
      const { text: transcribedText } = await transcribe(audioBuffer, 'voice.oga');

      if (!transcribedText || transcribedText.trim().length === 0) {
        return bot.sendMessage(chatId,
          '⚠️ Could not transcribe — no speech detected.',
          { reply_to_message_id: replied.message_id });
      }

      const result = await translate(transcribedText, { to: target });
      const from = friendlyName(result.from);
      const to = friendlyName(target);
      const response = `🎤 *Transcription:*\n\n${transcribedText}\n\n🌐 *Translation* (${from} → ${to}):\n\n${result.trans_result.dst}`;
      return bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_to_message_id: replied.message_id,
      });
    } catch (err) {
      console.error('[BOT] Transcribe+translate error:', err);
      return bot.sendMessage(chatId,
        '❌ Sorry, something went wrong transcribing/translating the voice message.',
        { reply_to_message_id: msg.message_id });
    }
  }

  const originalText = replied.text || replied.caption
    || (replied.poll && replied.poll.question) || null;

  if (!originalText) {
    return bot.sendMessage(chatId,
      '⚠️ The replied message has no text to translate.',
      { reply_to_message_id: msg.message_id });
  }

  try {
    const result = await translate(originalText, { to: target });
    const from = friendlyName(result.from);
    const to = friendlyName(target);
    const response = `🌐 *Translation* (${from} → ${to}):\n\n${result.trans_result.dst}`;
    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      reply_to_message_id: replied.message_id,
    });
  } catch (err) {
    console.error('[BOT] Translation error:', err);
    await bot.sendMessage(chatId,
      '❌ Sorry, something went wrong with the translation. Please try again.',
      { reply_to_message_id: msg.message_id });
  }
});

// ── /transcribe command ─────────────────────────────────────────────
const TRANSCRIBE_REGEX = /^\/transcribe(?:@\w+)?\s*$/i;

bot.onText(TRANSCRIBE_REGEX, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`[BOT] /transcribe handler fired — chat ${chatId}, msg ${msg.message_id}`);

  if (!msg.reply_to_message) {
    return bot.sendMessage(chatId,
      '💡 Reply to a voice message with /transcribe to transcribe it.',
      { reply_to_message_id: msg.message_id });
  }

  const replied = msg.reply_to_message;
  const voice = replied.voice || replied.audio || replied.video_note;

  if (!voice) {
    return bot.sendMessage(chatId,
      '⚠️ The replied message is not a voice/audio message.',
      { reply_to_message_id: msg.message_id });
  }

  const repliedMsgId = replied.message_id;
  if (dedup(chatId, repliedMsgId, 'transcribe')) {
    console.log(`[BOT] /transcribe — skipping, already processed msg ${repliedMsgId}`);
    return;
  }

  try {
    console.log(`[BOT] /transcribe — chat ${chatId}, voice file_id: ${voice.file_id}, duration: ${voice.duration}s`);
    await bot.sendChatAction(chatId, 'typing');
    console.log('[BOT] Downloading voice file from Telegram...');
    const audioBuffer = await downloadTelegramFile(voice.file_id);
    console.log(`[BOT] Downloaded ${audioBuffer.length} bytes, sending to STT...`);
    const { text } = await transcribe(audioBuffer, 'voice.oga');
    console.log(`[BOT] Transcription result: ${text ? text.length : 0} chars`);

    if (!text || text.trim().length === 0) {
      return bot.sendMessage(chatId,
        '⚠️ Could not transcribe — no speech detected.',
        { reply_to_message_id: replied.message_id });
    }

    await bot.sendMessage(chatId,
      `🎤 *Transcription:*\n\n${text}`,
      { parse_mode: 'Markdown', reply_to_message_id: replied.message_id });
  } catch (err) {
    console.error('[BOT] Transcription error:', err.message);
    console.error('[BOT] Full error:', err);
    await bot.sendMessage(chatId,
      '❌ Sorry, something went wrong with the transcription.',
      { reply_to_message_id: msg.message_id });
  }
});

// ── Per-chat settings (consolidated state) ────────────────────────
const chatSettings = new Map(); // chatId -> { autoTranslate, translateTarget, autoTranscribe, transcribeLang }

function getSettings(chatId) {
  if (!chatSettings.has(chatId)) {
    chatSettings.set(chatId, {
      autoTranslate: false,
      translateTarget: DEFAULT_TARGET,
      autoTranscribe: false,
      transcribeLang: 'fa' // default Farsi
    });
  }
  return chatSettings.get(chatId);
}

// ── /settings command ────────────────────────────────────────────────
const SETTINGS_REGEX = /^\/settings(?:@\w+)?\s*$/i;

bot.onText(SETTINGS_REGEX, async (msg) => {
  const chatId = msg.chat.id;
  await sendSettingsMenu(chatId, msg.message_id);
});

async function sendSettingsMenu(chatId, replyToMsgId = null, editMsgId = null) {
  const settings = getSettings(chatId);
  
  const text = `⚙️ *Chat Settings*\n\nConfigure automatic features:`;
  const keyboard = {
    inline_keyboard: [
      [{ text: `Auto-Translate: ${settings.autoTranslate ? '✅ ON' : '❌ OFF'}`, callback_data: 'toggle_translate' }],
      [{ text: `Translate To: ${friendlyName(settings.translateTarget)}`, callback_data: 'set_translate_lang' }],
      [{ text: `Auto-Transcribe: ${settings.autoTranscribe ? '✅ ON' : '❌ OFF'}`, callback_data: 'toggle_transcribe' }],
      [{ text: `Transcribe Default: ${friendlyName(settings.transcribeLang)}`, callback_data: 'set_transcribe_lang' }],
      [{ text: 'Done', callback_data: 'close_settings' }]
    ]
  };

  if (editMsgId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: editMsgId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (e) { /* ignore message not modified error */ }
  } else {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_to_message_id: replyToMsgId,
      reply_markup: keyboard
    });
  }
}

// ── Callback Query Handler ──────────────────────────────────────────
const pendingReplies = new Map(); // replyMsgId -> { type, menuMsgId }

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;
  const settings = getSettings(chatId);

  try {
    if (data === 'toggle_translate') {
      settings.autoTranslate = !settings.autoTranslate;
      await sendSettingsMenu(chatId, null, msgId);
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'toggle_transcribe') {
      settings.autoTranscribe = !settings.autoTranscribe;
      await sendSettingsMenu(chatId, null, msgId);
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'set_translate_lang') {
      const resp = await bot.sendMessage(chatId, '📝 Enter the new default language for *Auto-Translate* (e.g. `en`, `spanish`, `zh`):', {
        parse_mode: 'Markdown',
        reply_markup: { force_reply: true }
      });
      pendingReplies.set(resp.message_id, { type: 'translate_lang', menuMsgId: msgId });
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'set_transcribe_lang') {
      const resp = await bot.sendMessage(chatId, '🎤 Enter the new default fallback language for *Auto-Transcribe* (e.g. `fa`, `en`, `german`):', {
        parse_mode: 'Markdown',
        reply_markup: { force_reply: true }
      });
      pendingReplies.set(resp.message_id, { type: 'transcribe_lang', menuMsgId: msgId });
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'close_settings') {
      await bot.deleteMessage(chatId, msgId).catch(() => {});
      await bot.answerCallbackQuery(query.id);
    }
  } catch (err) {
    console.error('Callback query error:', err);
  }
});

// ── /autotranslate command ──────────────────────────────────────────
const AUTOTRANSLATE_REGEX = /^\/autotranslate(?:@\w+)?\s*(.*)?$/i;

bot.onText(AUTOTRANSLATE_REGEX, async (msg, match) => {
  const chatId = msg.chat.id;
  const commandArgs = (match[1] || '').trim();
  const { target, raw } = parseTarget(commandArgs);

  if (!target) {
    return bot.sendMessage(chatId,
      `❌ Unknown language: *${raw}*\n\nTry: \`/autotranslate to chinese\`, \`/autotranslate spanish\``,
      { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
  }

  const settings = getSettings(chatId);
  settings.autoTranslate = true;
  settings.translateTarget = target;
  const to = friendlyName(target);

  await bot.sendMessage(chatId,
    `✅ Auto-translate is *ON*\n\nForwarded text messages will be translated to *${to}*.\nUse /settings to configure.`,
    { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
});

// ── /autotranscribe command ─────────────────────────────────────────
const AUTOTRANSCRIBE_REGEX = /^\/autotranscribe(?:@\w+)?\s*$/i;

bot.onText(AUTOTRANSCRIBE_REGEX, async (msg) => {
  const chatId = msg.chat.id;
  const settings = getSettings(chatId);
  settings.autoTranscribe = true;

  await bot.sendMessage(chatId,
    '✅ Auto-transcribe is *ON*\n\nIncoming voice messages will be transcribed.\nUse /settings to configure.',
    { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
});

// ── /autooff command ────────────────────────────────────────────────
const AUTOOFF_REGEX = /^\/autooff(?:@\w+)?\s*$/i;

bot.onText(AUTOOFF_REGEX, async (msg) => {
  const chatId = msg.chat.id;
  const settings = getSettings(chatId);
  const hadModes = settings.autoTranslate || settings.autoTranscribe;
  settings.autoTranslate = false;
  settings.autoTranscribe = false;

  if (!hadModes) {
    return bot.sendMessage(chatId,
      '💡 No auto modes are currently active.',
      { reply_to_message_id: msg.message_id });
  }

  await bot.sendMessage(chatId,
    '🔴 All auto modes are *OFF*',
    { parse_mode: 'Markdown', reply_to_message_id: msg.message_id });
});

// ── Handle forwarded messages & replies ─────────────────────────────
const ALL_CMD = [COMMAND_REGEX, TRANSCRIBE_REGEX, SETTINGS_REGEX, AUTOTRANSLATE_REGEX, AUTOTRANSCRIBE_REGEX, AUTOOFF_REGEX];

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Handle replies to settings force-reply
  if (msg.reply_to_message && pendingReplies.has(msg.reply_to_message.message_id)) {
    const replyContext = pendingReplies.get(msg.reply_to_message.message_id);
    pendingReplies.delete(msg.reply_to_message.message_id);

    let target, raw;
    if (replyContext.type === 'transcribe_lang') {
      ({ target, raw } = parseTranscribeTarget(msg.text));
    } else {
      ({ target, raw } = parseTarget(msg.text));
    }

    if (!target) {
      await bot.sendMessage(chatId, `❌ Unknown language: *${raw}*`, { parse_mode: 'Markdown' });
      return;
    }

    const settings = getSettings(chatId);
    if (replyContext.type === 'translate_lang') {
      settings.translateTarget = target;
      settings.autoTranslate = true;
    } else if (replyContext.type === 'transcribe_lang') {
      settings.transcribeLang = target;
      settings.autoTranscribe = true;
    }

    // Clean up prompt messages and update menu
    bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    bot.deleteMessage(chatId, msg.reply_to_message.message_id).catch(() => {});
    await sendSettingsMenu(chatId, null, replyContext.menuMsgId);
    return;
  }

  // Skip commands
  if (msg.text && ALL_CMD.some((r) => r.test(msg.text))) return;

  // ── Voice → auto-transcribe (only if enabled, forwarded or directly sent) ──────────
  const voice = msg.voice || msg.audio || msg.video_note;
  const settings = getSettings(chatId);

  if (voice && settings.autoTranscribe) {
    if (dedup(chatId, msg.message_id, 'transcribe')) {
      console.log(`[BOT] auto-transcribe — skipping, already processed msg ${msg.message_id}`);
      return;
    }
    try {
      console.log(`[BOT] auto-transcribe — processing forwarded voice msg ${msg.message_id}`);
      await bot.sendChatAction(chatId, 'typing');
      const audioBuffer = await downloadTelegramFile(voice.file_id);
      const { text } = await transcribe(audioBuffer, 'voice.oga', settings.transcribeLang);

      if (!text || text.trim().length === 0) return;

      let response = `🎤 *Transcription:*\n\n${text}`;

      // If auto-translate is also on, translate the transcription too
      if (settings.autoTranslate) {
        try {
          const result = await translate(text, { to: settings.translateTarget });
          if (result.from !== settings.translateTarget) {
            const from = friendlyName(result.from);
            const to = friendlyName(settings.translateTarget);
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

  // ── Forwarded text → auto-translate (only if enabled) ─────────────
  if (!msg.forward_date) return;
  if (!settings.autoTranslate) return;

  const originalText = msg.text || msg.caption;
  if (!originalText || originalText.length < 2) return;

  try {
    const result = await translate(originalText, { to: settings.translateTarget });
    if (result.from === settings.translateTarget) return;

    const from = friendlyName(result.from);
    const to = friendlyName(settings.translateTarget);
    const response = `🌐 *Translation* (${from} → ${to}):\n\n${result.trans_result.dst}`;

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
