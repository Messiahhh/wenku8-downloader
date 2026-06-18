import { describe, expect, it } from 'vitest';
import { safeFilename } from './paths.js';

describe('safeFilename', () => {
  it('removes path separators, control characters and reserved names', () => {
    expect(safeFilename('a/b\\c: d?')).toBe('a_b_c_ d_');
    expect(safeFilename('CON')).toBe('untitled');
  });
});
