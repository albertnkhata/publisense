import { describe, expect, it } from 'vitest';
import { claimEmailPlaceholder, hostFromWebsite } from './claimEmail';

describe('hostFromWebsite', () => {
  it('reads the host the server will actually check against', () => {
    expect(hostFromWebsite('https://wsweep.invalid')).toBe('wsweep.invalid');
    expect(hostFromWebsite('https://claude.ai/pricing?x=1')).toBe('claude.ai');
    expect(hostFromWebsite('http://www.notion.so')).toBe('notion.so');
  });

  it('copes with scheme-less input and trailing paths', () => {
    expect(hostFromWebsite('raycast.com')).toBe('raycast.com');
    expect(hostFromWebsite('figma.com/community/file')).toBe('figma.com');
    expect(hostFromWebsite('https://linear.app:443/')).toBe('linear.app');
  });

  it('refuses input it cannot honestly turn into a domain', () => {
    expect(hostFromWebsite(undefined)).toBeNull();
    expect(hostFromWebsite('')).toBeNull();
    expect(hostFromWebsite('not a url')).toBeNull();
    expect(hostFromWebsite('localhost')).toBeNull();
  });
});

describe('claimEmailPlaceholder', () => {
  it('suggests an address on the product domain, matching the real rule', () => {
    // The regression: the slug said prod-wsweep.com while the check wanted wsweep.invalid.
    expect(claimEmailPlaceholder({ slug: 'prod-wsweep', websiteUrl: 'https://wsweep.invalid' })).toBe(
      'you@wsweep.invalid'
    );
    expect(claimEmailPlaceholder({ slug: 'claude', websiteUrl: 'https://claude.ai' })).toBe(
      'you@claude.ai'
    );
  });

  it('falls back to the slug only when there is no usable website', () => {
    expect(claimEmailPlaceholder({ slug: 'cursor', websiteUrl: '' })).toBe('you@cursor.com');
    expect(claimEmailPlaceholder({ slug: 'cursor' })).toBe('you@cursor.com');
  });

  it('always yields something typeable, even for a nameless product', () => {
    expect(claimEmailPlaceholder({ slug: '', websiteUrl: '' })).toBe('you@company.com');
  });
});
