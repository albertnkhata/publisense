import { describe, expect, it } from 'vitest';
import { displayHandle, resolveHandleSlug, resolveProfileHandle } from './handles';

describe('resolveHandleSlug', () => {
  const known = ['maya_lin', 'elena_v', 'albertnkhata_s'];

  it('links a handle a profile actually answers to', () => {
    expect(resolveHandleSlug('@maya_lin', known)).toBe('maya_lin');
    expect(resolveHandleSlug('maya_lin', known)).toBe('maya_lin');
  });

  it('matches case-insensitively and ignores stray whitespace', () => {
    expect(resolveHandleSlug('  @Maya_Lin  ', known)).toBe('maya_lin');
  });

  it('refuses to link a display label that is not a handle', () => {
    // The real case: seeded responders carry a team name in the same field.
    expect(resolveHandleSlug('@aman (Cursor Team)', known)).toBeNull();
    expect(resolveHandleSlug('@elena_rostova (Supabase)', known)).toBeNull();
  });

  it('returns nothing for empty or missing input rather than an empty link', () => {
    expect(resolveHandleSlug('', known)).toBeNull();
    expect(resolveHandleSlug('@', known)).toBeNull();
    expect(resolveHandleSlug(undefined, known)).toBeNull();
    expect(resolveHandleSlug('   ', known)).toBeNull();
  });

  it('does not match on a prefix or substring', () => {
    expect(resolveHandleSlug('@maya', known)).toBeNull();
    expect(resolveHandleSlug('@maya_lin_extra', known)).toBeNull();
  });
});

describe('resolveProfileHandle', () => {
  it('resolves through profile rows', () => {
    expect(
      resolveProfileHandle('@albert', [{ handle: 'albert' }, { handle: 'maya_lin' }])
    ).toBe('albert');
    expect(resolveProfileHandle('@nobody', [{ handle: 'albert' }])).toBeNull();
  });

  it('survives an empty catalogue instead of throwing', () => {
    expect(resolveProfileHandle('@albert', [])).toBeNull();
  });
});

describe('displayHandle', () => {
  it('prints the label as written, never a guessed slug', () => {
    expect(displayHandle('@aman (Cursor Team)')).toBe('@aman (Cursor Team)');
    expect(displayHandle('  @maya_lin ')).toBe('@maya_lin');
    expect(displayHandle(undefined)).toBe('');
  });
});
