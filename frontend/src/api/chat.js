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
