import client from './client';

/**
 * The Manusmriti section's content: { topics, posts, verses, translation }.
 * Read-only; there is nothing to send. Rejects with a 404 while the server's trial switch is off.
 */
export async function fetchManusmriti() {
  const { data } = await client.get('/manusmriti/posts');
  return data;
}
