import { describe, expect, it } from 'vitest';
import { passwordStrength } from '../lib/passwordStrength';

describe('passwordStrength', () => {
  it('scores 0–3', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('abcdefg1')).toBe(2);
    expect(passwordStrength('Correct-horse-9')).toBe(3);
  });
});
