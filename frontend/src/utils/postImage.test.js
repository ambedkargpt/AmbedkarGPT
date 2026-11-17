// How the post's words are fitted onto the image template.

import { describe, expect, it } from 'vitest';

import { balance, fit, headlineLines, markHighlight, partyKey, wrap } from './postImage';

// A stand-in for canvas text measurement: every character is 10px at size 10.
const at = (size) => (s) => s.length * size;

describe('wrap', () => {
  it('breaks between words, never inside one, and keeps the text\'s own line breaks', () => {
    expect(wrap('एक दो तीन चार', 70, at(10))).toEqual(['एक दो', 'तीन चार']);
    expect(wrap('पहली पंक्ति,\nदूसरी पंक्ति', 1000, at(10))).toEqual(['पहली पंक्ति,', 'दूसरी पंक्ति']);
  });
});

describe('fit', () => {
  const opts = { width: 200, height: 100, max: 40, min: 10, lineHeight: 1, measureAt: at };
  it('uses the largest size at which the text fits', () => {
    expect(fit('छोटा', opts).size).toBe(40);
    const long = fit('शब्द '.repeat(12).trim(), opts);
    expect(long.size).toBeLessThan(40);
    expect(long.lines.length * long.size).toBeLessThanOrEqual(100);
  });
  it('at the smallest size, cuts to the lines that fit and ends with an ellipsis', () => {
    const out = fit('शब्द '.repeat(200).trim(), opts);
    expect(out.size).toBe(10);
    expect(out.lines).toHaveLength(10);
    expect(out.lines.at(-1).endsWith('…')).toBe(true);
  });
});

describe('partyKey', () => {
  it('reads the party off the account, Congress when it is anything else', () => {
    expect(partyKey('Samajwadi Party (SP)')).toBe('samajwadi');
    expect(partyKey('Indian National Congress (INC)')).toBe('congress');
    expect(partyKey('')).toBe('congress');
  });
});

describe('the card text', () => {
  it('splits a two-line wrap evenly instead of leaving one word alone', () => {
    expect(balance(['एक दो तीन चार', 'पाँच'], 200, at(10))).toEqual(['एक दो तीन', 'चार पाँच']);
    expect(balance(['एक'], 200, at(10))).toEqual(['एक']);
  });
  it('takes the couplet as the two headline lines, or splits a one-line headline near its middle', () => {
    expect(headlineLines('पहली पंक्ति,\nदूसरी पंक्ति।')).toEqual(['पहली पंक्ति,', 'दूसरी पंक्ति।']);
    expect(headlineLines('चीन की धमकी मोदी की चुप्पी')).toEqual(['चीन की धमकी', 'मोदी की चुप्पी']);
  });
  it('marks the phrase to colour, ignoring the danda after it', () => {
    const out = markHighlight('यह दिखावा नहीं, हकीकत दिखाओ।', 'हकीकत दिखाओ');
    expect(out.filter((w) => w.strong).map((w) => w.w)).toEqual(['हकीकत', 'दिखाओ।']);
    expect(markHighlight('कुछ और', 'नहीं है').some((w) => w.strong)).toBe(false);
  });
});
