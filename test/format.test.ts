import { describe, it, expect } from 'vitest';
import { SlvrSDK } from '../src';

describe('SlvrSDK.formatToken / parseToken', () => {
  it('formats wei to a human string (trailing zeros stripped)', () => {
    expect(SlvrSDK.formatToken(1_500_000_000_000_000_000n)).toBe('1.5');
    expect(SlvrSDK.formatToken(1_000_000_000_000_000_000n)).toBe('1');
    expect(SlvrSDK.formatToken(1_500_000_000_000_000_000n, 18, 6)).toBe('1.5');
    expect(SlvrSDK.formatToken(1_234_500_000_000_000_000n, 18, 2)).toBe('1.23'); // precision caps decimals
  });

  it('parses a human string to wei', () => {
    expect(SlvrSDK.parseToken('1.5')).toBe(1_500_000_000_000_000_000n);
    expect(SlvrSDK.parseToken('0')).toBe(0n);
    expect(SlvrSDK.parseToken('100')).toBe(100_000_000_000_000_000_000n);
  });

  it('round-trips', () => {
    const wei = SlvrSDK.parseToken('42.25');
    expect(SlvrSDK.formatToken(wei, 18, 2)).toBe('42.25');
  });
});

describe('SlvrSDK.calculateBetAmounts', () => {
  it('splits a total by percentages, summing exactly to the total', () => {
    const total = 1_000_000_000_000_000_000n;
    const amounts = SlvrSDK.calculateBetAmounts(total, [25, 25, 25, 25]);
    expect(amounts).toHaveLength(4);
    expect(amounts.reduce((a, b) => a + b, 0n)).toBe(total);
    expect(amounts[1]).toBe(250_000_000_000_000_000n);
  });

  it('puts rounding dust on the first entry so the sum is exact', () => {
    const total = 1_000_000_000_000_000_000n;
    const amounts = SlvrSDK.calculateBetAmounts(total, [33.33, 33.33, 33.34]);
    expect(amounts.reduce((a, b) => a + b, 0n)).toBe(total);
  });

  it('throws when percentages do not sum to 100', () => {
    expect(() => SlvrSDK.calculateBetAmounts(1n, [50, 40])).toThrow();
    expect(() => SlvrSDK.calculateBetAmounts(1n, [])).toThrow();
  });
});
