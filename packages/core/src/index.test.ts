import { describe, expect, it } from 'vitest';
import { inRange, type PrincipleRange } from './index';

const principle: PrincipleRange = {
  id: 'sample-angle',
  phase: 'release',
  min: 0,
  max: 15,
  unit: 'deg',
};

describe('inRange', () => {
  it('accepts a value inside the accepted range', () => {
    expect(inRange(principle, 10)).toBe(true);
  });

  it('rejects a value outside the accepted range', () => {
    expect(inRange(principle, 30)).toBe(false);
  });

  it('throws on a non-finite value (negative path)', () => {
    expect(() => inRange(principle, Number.NaN)).toThrow(TypeError);
  });
});
