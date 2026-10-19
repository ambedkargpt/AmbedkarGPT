import client from './client';

/**
 * Send a message to BheemBot.
 * @param {string} message - The user's message
 * @param {Array<{role:string, content:string}>} history - Previous turns
 * @param {string} language - "en" | "hi"
 * @returns {Promise<{reply: string, sources: Array}>}
 */
export async function sendChatMessage({ message, history = [], language = 'en' }) {
  const { data } = await client.post('/chat/message', { message, history, language });
  return data;
}

/**
 * Turn a recorded question into text on the server.
 * @param {Blob} blob - the recording
 * @param {string} language - "en" | "hi"
 * @returns {Promise<string>}
 */
export async function transcribeAudio(blob, language = 'hi') {
  const audio_b64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { data } = await client.post('/chat/transcribe', { audio_b64, mime: blob.type, language });
  return data?.text || '';
}
