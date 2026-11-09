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
