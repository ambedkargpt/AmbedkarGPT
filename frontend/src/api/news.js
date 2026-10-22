import client from './client';

// GET /news — paginated news list, optional language filter ("en" | "hi")
// `tenant` selects a political party (id or slug); `includeGeneral` controls
// whether neutral/general news is mixed in alongside that party's news, and
// `includeOpposition` likewise for the opposition's (BJP) own news.
export async function getNews({ limit = 100, skip = 0, language, tenant, includeGeneral, includeOpposition } = {}) {
  const params = { limit, skip };
  if (language) params.language = language;
  if (tenant !== undefined && tenant !== null && tenant !== '') params.tenant = tenant;
  if (includeGeneral !== undefined) params.include_general = includeGeneral;
  if (includeOpposition !== undefined) params.include_opposition = includeOpposition;
  const { data } = await client.get('/news/', { params });
  return data;
}

// GET /news/tenants — registry of selectable parties (+ the general tenant)
export async function getTenants() {
  const { data } = await client.get('/news/tenants');
  return data?.tenants ?? [];
}

// GET /news/:id
export async function getNewsById(id) {
  const { data } = await client.get(`/news/${id}`);
  return data;
}

// GET /news/by-news-id/:newsId - by the story's own id ("news_001258"), the one
// the radio manifest carries, rather than the database id.
export async function getNewsByStoryId(newsId) {
  const { data } = await client.get(`/news/by-news-id/${encodeURIComponent(newsId)}`);
  return data;
}
