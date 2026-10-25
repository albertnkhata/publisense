import { describe, expect, it } from 'vitest';
import { sourceAuthorFromUrl, sourceCredit } from '../api/posts';

describe('original poster on seeded posts (0032)', () => {
  it('reads the handle from an X link', () => {
    expect(sourceAuthorFromUrl('https://x.com/jeff_weinstein/status/2114090553466065364')).toBe('@jeff_weinstein');
    expect(sourceAuthorFromUrl('https://twitter.com/someone/status/1')).toBe('@someone');
    // x.com/i/status links don't name the poster.
    expect(sourceAuthorFromUrl('https://x.com/i/status/2114090553466065364')).toBeNull();
  });

  it('reads a Reddit profile link, but not a thread', () => {
    expect(sourceAuthorFromUrl('https://www.reddit.com/user/spez')).toBe('u/spez');
    expect(sourceAuthorFromUrl('https://www.reddit.com/r/instacart/comments/12fq3s6/x')).toBeNull();
    expect(sourceAuthorFromUrl('https://github.com/acme/notes/issues/7')).toBeNull();
    expect(sourceAuthorFromUrl('not a link')).toBeNull();
  });

  it('credits the poster when known, otherwise the source', () => {
    expect(sourceCredit({ source_url: 'https://x.com/jeff_weinstein/status/1', source_author: '@jeff_weinstein' })).toBe('@jeff_weinstein on X');
    expect(sourceCredit({ source_url: 'https://www.reddit.com/r/a/comments/1', source_author: null })).toBe('from Reddit');
  });
});
