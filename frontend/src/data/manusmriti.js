// What the Manusmriti section does with the posts it is given: which ones a topic shows, what the Copy
// button puts on the clipboard, and the link that opens X. Kept apart from the page so the parts that can
// go quietly wrong (a thread posted as one tweet, a topic that shows nothing) have a test.

/** The filter value that shows every post. */
export const ALL = 'all';

/** The posts of one topic, or all of them. An unknown topic shows nothing rather than everything. */
export function postsForTopic(posts, topic) {
  return topic === ALL ? posts : posts.filter((p) => p.topic === topic);
}

/** A thread has more than one part; a single post has exactly one. */
export const isThread = (post) => post.parts.length > 1;

/** The post as plain text for the clipboard. A thread's parts are separated by a rule, ready to paste one by one. */
export function copyText(post) {
  return isThread(post) ? post.parts.join('\n\n---\n\n') : post.parts[0];
}

/**
 * The link that opens X's composer with this text in it. Only a single post has one: X cannot post a thread in
 * one go, so a thread gets null and the page tells the reader to post it part by part.
 */
export function xComposeUrl(post) {
  return isThread(post) ? null : `https://x.com/intent/post?text=${encodeURIComponent(post.parts[0])}`;
}

/** The topic whose id the query string names, or ALL when it names none that exists. */
export function topicFromQuery(value, topics) {
  return topics.some((t) => t.id === value) ? value : ALL;
}

/** How many entries a page shows. */
export const PAGE_SIZE = 10;

/**
 * One page of a list. `value` is whatever the address said (?page=...), so it may be missing, not a number, or
 * out of range: it falls back to the nearest page that exists instead of showing an empty one. Also returns the
 * figures the counter shows ("Showing 11-20 of 37").
 */
export function paginate(items, value, size = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const wanted = Number.parseInt(value, 10);
  const page = Number.isInteger(wanted) ? Math.min(Math.max(wanted, 1), pages) : 1;
  const start = (page - 1) * size;
  return {
    items: items.slice(start, start + size),
    page,
    pages,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + size, total),
  };
}

/**
 * The page buttons to draw. Up to seven pages are all shown; more than that, the first, the last and the
 * neighbours of the current page, with 'gap' where numbers are left out.
 */
export function pageNumbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = [...new Set([1, pages, page - 1, page, page + 1])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  let last = 0;
  for (const n of keep) {
    if (n - last > 1) out.push('gap');
    out.push(n);
    last = n;
  }
  return out;
}

/** The address query for a topic and page: nothing for "all, first page", so the plain address stays plain. */
export function sectionQuery(topic, page) {
  return { ...(topic !== ALL && { topic }), ...(page > 1 && { page: String(page) }) };
}
