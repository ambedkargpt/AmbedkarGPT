// The small decisions behind the Manusmriti section.

import { describe, expect, it } from 'vitest';

import {
  ALL, PAGE_SIZE, copyText, isThread, pageNumbers, paginate, postsForTopic, sectionQuery, topicFromQuery, xComposeUrl,
} from './manusmriti';

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

describe('paginate', () => {
  const list = Array.from({ length: 37 }, (_, i) => i + 1);

  it('shows ten entries a page, and says which ones', () => {
    expect(PAGE_SIZE).toBe(10);
    const first = paginate(list, '1');
    expect(first.items).toEqual(list.slice(0, 10));
    expect([first.page, first.pages, first.total, first.from, first.to]).toEqual([1, 4, 37, 1, 10]);
    const second = paginate(list, '2');
    expect([second.items[0], second.items.length, second.from, second.to]).toEqual([11, 10, 11, 20]);
  });

  it('gives the last page only what is left', () => {
    const last = paginate(list, '4');
    expect(last.items).toEqual([31, 32, 33, 34, 35, 36, 37]);
    expect([last.from, last.to]).toEqual([31, 37]);
  });

  it('falls back into range for a page that is missing, not a number, zero, negative or too big', () => {
    expect(paginate(list, null).page).toBe(1);
    expect(paginate(list, 'abc').page).toBe(1);
    expect(paginate(list, '0').page).toBe(1);
    expect(paginate(list, '-3').page).toBe(1);
    expect(paginate(list, '99').page).toBe(4);
    expect(paginate(list, '99').items).toHaveLength(7);
  });

  it('is one page when everything fits, and an empty list is one empty page with nothing to count', () => {
    expect(paginate(list.slice(0, 10), '1').pages).toBe(1);
    expect(paginate(list.slice(0, 6), '2')).toMatchObject({ page: 1, pages: 1, from: 1, to: 6 });
    expect(paginate([], '1')).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
});

describe('pageNumbers', () => {
  it('shows every page when there are few', () => {
    expect(pageNumbers(2, 4)).toEqual([1, 2, 3, 4]);
    expect(pageNumbers(1, 1)).toEqual([1]);
  });
  it('shortens a long run around the current page', () => {
    expect(pageNumbers(1, 12)).toEqual([1, 2, 'gap', 12]);
    expect(pageNumbers(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12]);
    expect(pageNumbers(12, 12)).toEqual([1, 'gap', 11, 12]);
    expect(pageNumbers(2, 8)).toEqual([1, 2, 3, 'gap', 8]);
  });
});

describe('sectionQuery', () => {
  it('leaves the address plain for all topics on the first page', () => {
    expect(sectionQuery(ALL, 1)).toEqual({});
  });
  it('names the topic and the page only when they are not the default', () => {
    expect(sectionQuery('sudras', 1)).toEqual({ topic: 'sudras' });
    expect(sectionQuery(ALL, 3)).toEqual({ page: '3' });
    expect(sectionQuery('sudras', 2)).toEqual({ topic: 'sudras', page: '2' });
  });
});
