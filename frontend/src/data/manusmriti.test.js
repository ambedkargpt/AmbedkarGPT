// The small decisions behind the Manusmriti section.

import { describe, expect, it } from 'vitest';

import { ALL, copyText, isThread, postsForTopic, topicFromQuery, xComposeUrl } from './manusmriti';

const SINGLE = { id: 'a', topic: 'punishment', parts: ['Same insult. Different price.\n\nIs this justice?'] };
const THREAD = { id: 'b', topic: 'sudras', parts: ['1/2 First.', '2/2 Second.'] };
const POSTS = [SINGLE, THREAD, { id: 'c', topic: 'punishment', parts: ['Another.'] }];
const TOPICS = [{ id: 'punishment' }, { id: 'sudras' }];

describe('postsForTopic', () => {
  it('shows every post for ALL and only that topic otherwise', () => {
    expect(postsForTopic(POSTS, ALL)).toHaveLength(3);
    expect(postsForTopic(POSTS, 'punishment').map((p) => p.id)).toEqual(['a', 'c']);
  });
  it('shows nothing, not everything, for a topic that does not exist', () => {
    expect(postsForTopic(POSTS, 'nope')).toEqual([]);
  });
});

describe('copyText', () => {
  it('copies a single post exactly as written', () => {
    expect(copyText(SINGLE)).toBe(SINGLE.parts[0]);
  });
  it('separates a thread\'s parts with a rule so they can be pasted one by one', () => {
    expect(copyText(THREAD)).toBe('1/2 First.\n\n---\n\n2/2 Second.');
  });
});

describe('xComposeUrl', () => {
  it('encodes the whole post, line breaks included', () => {
    const url = xComposeUrl(SINGLE);
    expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(SINGLE.parts[0]);
  });
  it('gives a thread no link, because X cannot post a thread in one go', () => {
    expect(isThread(THREAD)).toBe(true);
    expect(xComposeUrl(THREAD)).toBeNull();
  });
});

describe('topicFromQuery', () => {
  it('keeps a topic that exists and falls back to ALL for anything else', () => {
    expect(topicFromQuery('sudras', TOPICS)).toBe('sudras');
    expect(topicFromQuery('nope', TOPICS)).toBe(ALL);
    expect(topicFromQuery(null, TOPICS)).toBe(ALL);
  });
});
