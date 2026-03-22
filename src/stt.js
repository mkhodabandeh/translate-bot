const { BatchClient } = require('@speechmatics/batch-client');

const API_KEY = process.env.SPEECHMATIC_API_KEY;

let client = null;

function getClient() {
  if (!client) {
    if (!API_KEY) {
      throw new Error('SPEECHMATIC_API_KEY is not set');
    }
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
  const sm = getClient();

  // Try multiple input formats for Node.js version compatibility
  let input;
  try {
    // Preferred: Blob + fileName object (works in Node 18+)
    const blob = new Blob([audioBuffer]);
    input = { data: blob, fileName: filename };
  } catch (e) {
    // Fallback: use File if Blob fails
    console.error('Blob not available, trying buffer directly:', e.message);
    input = { data: audioBuffer, fileName: filename };
  }

  console.log(`Sending ${audioBuffer.length} bytes to Speechmatics for transcription...`);

  const response = await sm.transcribe(
    input,
    {
      transcription_config: {
        language: 'auto',
      },
    },
    'txt',  // use plain text format for simplicity
  );

  console.log('Speechmatics response type:', typeof response);

  // 'txt' format returns a plain string
  if (typeof response === 'string') {
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
    return { text, language };
  }

  return { text: '', language: 'unknown' };
}

module.exports = { transcribe };
