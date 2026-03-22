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

  const blob = new Blob([audioBuffer]);
  const file = new File([blob], filename);

  const response = await sm.transcribe(
    file,
    {
      transcription_config: {
        language: 'auto',
      },
    },
    'json-v2',
  );

  // json-v2 format returns an object with results array
  if (typeof response === 'string') {
    return { text: response, language: 'unknown' };
  }

  const text = response.results
    .filter((r) => r.type === 'word')
    .map((r) => r.alternatives?.[0]?.content)
    .filter(Boolean)
    .join(' ');

  const language = response.metadata?.language || 'unknown';

  return { text, language };
}

module.exports = { transcribe };
