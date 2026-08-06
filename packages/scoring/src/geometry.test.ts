import { describe, expect, it } from 'vitest';
import {
  alongM,
  angle3Deg,
  distanceOutsideConvexPolygon,
  horizontalAngleBetweenDeg,
  lateralOffsetM,
  pointInConvexPolygon,
  segmentVsVerticalDeg,
  signedTiltTowardDeg,
} from './geometry';

const square: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

describe('measurement geometry', () => {
  it('angle3Deg: straight, right angle, folded', () => {
    expect(angle3Deg([0, 0, 1], [0, 0, 0], [0, 0, -1])).toBeCloseTo(180);
    expect(angle3Deg([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90);
    expect(angle3Deg([1, 0, 0], [0, 0, 0], [1, 0, 1e-8])).toBeCloseTo(0, 3);
    expect(() => angle3Deg([0, 0, 0], [0, 0, 0], [1, 0, 0])).toThrow(/degenerate/);
  });

  it('segmentVsVerticalDeg: up is 0, horizontal is 90', () => {
    expect(segmentVsVerticalDeg([0, 0, 0], [0, 0, 2])).toBeCloseTo(0);
    expect(segmentVsVerticalDeg([0, 0, 0], [3, 0, 0])).toBeCloseTo(90);
    expect(segmentVsVerticalDeg([0, 0, 0], [1, 0, 1])).toBeCloseTo(45);
  });

  it('signedTiltTowardDeg: toward is positive, away negative', () => {
    expect(signedTiltTowardDeg([0, 0, 0], [0.1, 0, 1], [1, 0, 0])).toBeGreaterThan(0);
    expect(signedTiltTowardDeg([0, 0, 0], [-0.1, 0, 1], [1, 0, 0])).toBeLessThan(0);
    expect(signedTiltTowardDeg([0, 0, 0], [0, 0.4, 1], [1, 0, 0])).toBeCloseTo(0);
    expect(signedTiltTowardDeg([0, 0, 0], [1, 0, 1], [1, 0, 0])).toBeCloseTo(45);
  });

  it('horizontalAngleBetweenDeg ignores z', () => {
    expect(horizontalAngleBetweenDeg([1, 0, 5], [1, 0, -5])).toBeCloseTo(0);
    expect(horizontalAngleBetweenDeg([1, 0, 0], [0, 1, 0])).toBeCloseTo(90);
    expect(horizontalAngleBetweenDeg([1, 0, 0], [-1, 1e-9, 0])).toBeCloseTo(180);
  });

  it('pointInConvexPolygon: inside, edge, outside, degenerate', () => {
    expect(pointInConvexPolygon([0, 0], square)).toBe(true);
    expect(pointInConvexPolygon([1, 0], square)).toBe(true); // on the edge
    expect(pointInConvexPolygon([1.01, 0], square)).toBe(false);
    expect(pointInConvexPolygon([0, 0], [[0, 0], [1, 1]])).toBe(false);
  });

  it('distanceOutsideConvexPolygon: 0 inside, edge and corner distances outside', () => {
    expect(distanceOutsideConvexPolygon([0.5, 0.5], square)).toBe(0);
    expect(distanceOutsideConvexPolygon([2, 0], square)).toBeCloseTo(1);
    expect(distanceOutsideConvexPolygon([2, 2], square)).toBeCloseTo(Math.SQRT2);
  });

  it('lateralOffsetM: signed distance from the vertical target plane', () => {
    // Plane through origin along +x: offsets are ±y.
    expect(lateralOffsetM([0.5, 0.25, 9], [0, 0, 0], [1, 0, 0])).toBeCloseTo(0.25);
    expect(lateralOffsetM([0.5, -0.25, -3], [0, 0, 0], [1, 0, 0])).toBeCloseTo(-0.25);
  });

  it('alongM: signed projection onto a direction', () => {
    expect(alongM([2, 0, 0], [0, 0, 0], [1, 0, 0])).toBeCloseTo(2);
    expect(alongM([-1, 5, 0], [0, 0, 0], [1, 0, 0])).toBeCloseTo(-1);
  });
});
