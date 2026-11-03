// News shape and party resolution, shared by the social post generator and the
// dashboard's top-story card so both read the same party and the same story.

// Map backend NewsResponse → local article shape
export function adaptNews(item) {
  return {
    id:       item.id,
    _backendId: item.id, // valid MongoDB ObjectId from backend
    category: item.tags?.[0] ?? 'General',
    title:    item.headline,
    content:  item.description || item.summary,
    summary:  item.summary || item.description || '',
    source:   item.source_name || '',
    date:     item.published_at || '',
    topic:    item.summary || item.headline,
    tenantId:   item.tenant_id ?? 0,
    tenantSlug: item.tenant_slug || 'general',
    contentType: item.content_type || 'news',
    // Level of politics. Absent on stories published before levels existed,
    // which all came from the parties' central channels.
    scope:      item.scope || 'national',
    region:     item.region || '',
    sourceUrl:  item.source_url || '',
  };
}

// Signup stores a display name ("Indian National Congress (INC)"); the tenant
// registry keys on a slug. Match on the registry name being contained in it.
export function resolveTenantForUser(partyName, tenants) {
  const raw = (partyName ?? '').trim().toLowerCase();
  if (!raw) return null;
  // The opposition tenant (BJP) is scraped to be countered, never to be
  // someone's own party — excluded here the same way it is excluded from
  // the signup party picker, so it can never become "your party" even if a
  // stray political_party value happened to match its name or slug.
  const selectable = tenants.filter((t) => !t.is_general && !t.is_opposition);
  return (
    selectable.find((t) => raw.includes(String(t.name).toLowerCase()))
    ?? selectable.find((t) => raw.includes(String(t.slug).toLowerCase()))
    ?? null
  );
}

// The YouTube video id in a story's source URL, or ''. Stories are cut from
// videos, so their source is "https://www.youtube.com/watch?v=ID#story-1".
export function youtubeId(url) {
  const m = String(url || '').match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : '';
}
