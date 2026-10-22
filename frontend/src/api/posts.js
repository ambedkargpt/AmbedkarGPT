import client from './client';

// POST /posts — save a generated post
export async function createPost({ userId, newsId, content, hashtags = [], status = 'draft', generationMeta }) {
  const { data } = await client.post('/posts', {
    user_id: userId,
    news_id: newsId,
    content,
    hashtags,
    status,
    generation_meta: generationMeta,
  });
  return data;
}

// POST /posts/generate — run retrieval + LLM generation on backend
export async function generatePostForNews({ userId, newsId, tone, temperature, language, profileOverrides }) {
  const payload = {
    user_id: userId,
    news_id: newsId,
    tone,
    temperature,
    language,
    profile_overrides: profileOverrides,
  };
  const startedAt = Date.now();
  try {
    const { data } = await client.post('/posts/generate', payload);
    return data;
  } catch (err) {
    // The gateway gives up at 30 s (502/503/504, or no response at all) while
    // the server goes on writing and saves the post. Wait for that post rather
    // than reporting a failure - and rather than generating again, which would
    // cost a second post from the daily five.
    const code = err?.response?.status;
    if (code && ![502, 503, 504].includes(code)) throw err;
    for (let i = 0; i < 15; i += 1) {
      await new Promise((r) => setTimeout(r, 4000));
      const post = await findPostWrittenSince(newsId, startedAt).catch(() => null);
      if (post) return { post, references: [], recovered: true };
    }
    throw err;
  }
}

// GET /posts/warm — load the retrieval stack into the API container before
// the first generate, so that generate fits inside the gateway's 30 s.
export async function warmGenerator() {
  const { data } = await client.get('/posts/warm', { timeout: 60_000 });
  return data;
}

// The newest post for a story written since `sinceMs`, or null. A generate that
// outlives the gateway's 30 s comes back as a 503 while the server finishes and
// saves the post; this finds it instead of asking for (and charging) a second.
export async function findPostWrittenSince(newsId, sinceMs) {
  const { data } = await client.get('/posts/', { params: { news_id: newsId, limit: 5 } });
  // The API writes UTC times without a zone; read them as UTC, not local time.
  const at = (p) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(p.created_at) ? p.created_at : `${p.created_at}Z`);
  const fresh = (data || []).filter((p) => at(p) >= sinceMs - 5000);
  fresh.sort((a, b) => at(b) - at(a));
  return fresh[0] || null;
}

// POST /posts/:id/regenerate — rerun LLM only using stored retrieval snapshot.
// refinementNote is required: it is the only thing that makes the refinement a
// different request from the generation it came from, so the server rejects a
// blank one. Allowed once per post.
export async function regeneratePostFromSnapshot(postId, { temperature, language, profileOverrides, refinementNote } = {}) {
  const payload = { temperature, language, profile_overrides: profileOverrides, refinement_note: refinementNote };
  const { data } = await client.post(`/posts/${postId}/regenerate`, payload);
  return data;
}

// POST /posts/:id/toggle-version — switch a refined post between the refined
// text and the one it replaced, so the user can publish either. Free: no model
// call. Only available until the post is published, when the other is dropped.
export async function togglePostVersion(postId) {
  const { data } = await client.post(`/posts/${postId}/toggle-version`);
  return data;
}

// POST /posts/:id/translate — translate post content to another language
export async function translatePost(postId, targetLanguage = 'en') {
  const { data } = await client.post(`/posts/${postId}/translate`, {
    target_language: targetLanguage,
  });
  return data; // { translated_content, target_language }
}

// GET /posts/daily-quota — used/remaining/reset_at + all-time total
export async function getDailyQuota() {
  const { data } = await client.get('/posts/daily-quota');
  return data; // { used, limit, remaining, reset_at, total_posts, milestone_target }
}

// GET /posts — list user's posts
export async function getPosts({ newsId, status, limit = 50, skip = 0 } = {}) {
  const { data } = await client.get('/posts/', {
    params: { news_id: newsId, status, limit, skip },
  });
  return data;
}

// PATCH /posts/:id
export async function updatePost(id, updates) {
  const { data } = await client.patch(`/posts/${id}`, updates);
  return data;
}

// DELETE /posts/:id (archives)
export async function deletePost(id) {
  const { data } = await client.delete(`/posts/${id}`);
  return data;
}
