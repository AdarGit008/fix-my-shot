import { describe, expect, it } from 'vitest';
import { inRange, type Band } from './index';

const band: Band = { kind: 'band', min: 0, max: 15, unit: 'deg' };

describe('inRange', () => {
  it('accepts a value inside the band', () => {
    expect(inRange(band, 10)).toBe(true);
  });

  it('rejects a value outside the band', () => {
    expect(inRange(band, 30)).toBe(false);
  });

  it('throws on a non-finite value (negative path)', () => {
    expect(() => inRange(band, Number.NaN)).toThrow(TypeError);
  });
});
