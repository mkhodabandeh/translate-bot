const { BatchClient } = require('@speechmatics/batch-client');

const API_KEY = process.env.SPEECHMATIC_API_KEY;

let client = null;

function getClient() {
  if (!client) {
    if (!API_KEY) {
      throw new Error('SPEECHMATIC_API_KEY is not set');
    }
    console.log('[STT] Creating Speechmatics BatchClient (API key present, length:', API_KEY.length, ')');
    client = new BatchClient({ apiKey: API_KEY, appId: 'telegram-translate-bot' });
  }
  return client;
}

/**
 * Transcribe an audio buffer using Speechmatics batch API.
 * @param {Buffer} audioBuffer - The audio file data
 * @param {string} filename - Original filename (e.g. "voice.oga")
 * @returns {Promise<{ text: string, language: string }>}
 */
async function transcribe(audioBuffer, filename = 'voice.oga') {
  console.log(`[STT] transcribe() called — buffer size: ${audioBuffer.length} bytes, filename: ${filename}`);

  const sm = getClient();

  // Try multiple input formats for Node.js version compatibility
  let input;
  try {
    // Preferred: Blob + fileName object (works in Node 18+)
    const blob = new Blob([audioBuffer]);
    input = { data: blob, fileName: filename };
    console.log('[STT] Using Blob input format');
  } catch (e) {
    // Fallback: use File if Blob fails
    console.error('[STT] Blob not available, using raw buffer:', e.message);
    input = { data: audioBuffer, fileName: filename };
  }

  console.log(`[STT] Sending ${audioBuffer.length} bytes to Speechmatics...`);

  try {
    const response = await sm.transcribe(
      input,
      {
        transcription_config: {
          language: 'fa',
        },
      },
      'txt',  // use plain text format for simplicity
    );

    console.log('[STT] Speechmatics response type:', typeof response);
    console.log('[STT] Speechmatics response preview:', JSON.stringify(response).slice(0, 500));

    // 'txt' format returns a plain string
    if (typeof response === 'string') {
      console.log(`[STT] Got text response (${response.trim().length} chars)`);
      return { text: response.trim(), language: 'auto' };
    }

    // Fallback for json-v2 format
    if (response && response.results) {
      const text = response.results
        .filter((r) => r.type === 'word')
        .map((r) => r.alternatives?.[0]?.content)
        .filter(Boolean)
        .join(' ');

      const language = response.metadata?.language || 'unknown';
      console.log(`[STT] Got JSON response — ${text.length} chars, language: ${language}`);
      return { text, language };
    }

    console.warn('[STT] Unexpected response format — returning empty text');
    return { text: '', language: 'unknown' };
  } catch (err) {
    console.error('[STT] Speechmatics API error:');
    console.error('[STT]   message:', err.message);
    console.error('[STT]   name:', err.name);
    if (err.response) {
      console.error('[STT]   status:', err.response.status);
      console.error('[STT]   statusText:', err.response.statusText);
      try {
        const body = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
        console.error('[STT]   body:', body.slice(0, 1000));
      } catch (_) {}
    }
    if (err.cause) {
      console.error('[STT]   cause:', err.cause);
    }
    console.error('[STT]   stack:', err.stack);
    throw err;  // re-throw so bot.js can handle it
  }
}

module.exports = { transcribe };
