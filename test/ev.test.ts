import { describe, it, expect } from 'vitest';
import {
  computeGridMiningEv,
  GRID_SIZE,
  SINGLE_SQUARE_WIN_PROBABILITY,
  PROTOCOL_FEE_BPS,
  JACKPOT_ODDS,
} from '../src/ev';

describe('constants', () => {
  it('match the on-chain protocol values', () => {
    expect(GRID_SIZE).toBe(25);
    expect(SINGLE_SQUARE_WIN_PROBABILITY).toBeCloseTo(1 / 25, 12);
    expect(PROTOCOL_FEE_BPS).toBe(1000);
    expect(JACKPOT_ODDS).toBe(625);
  });
});

describe('computeGridMiningEv', () => {
  // Cross-check against the protocol's own edge calculator (its default inputs).
  // Web calculator (USD): pot=0.58, stake=0.1251, jackpot=5.2361 ETH, SLVR=$104,
  // ETH=$1797.35, emit=1, odds=625, hold mode → net ≈ $3.194680, break-even pot 0.662407.
  const E = 1797.35;
  const base = {
    stake: 0.1251,
    pot: 0.58,
    emissionPerRound: 1,
    slvrPriceEth: 104 / E,
    jackpotPool: 5.2361,
    jackpotOdds: 625,
  };

  it('reproduces the web calculator numbers', () => {
    const ev = computeGridMiningEv(base);
    expect(ev.netEth * E).toBeCloseTo(3.19468, 4);
    expect(ev.breakEvenPot).toBeCloseTo(0.662407, 5);
    expect(ev.share).toBeCloseTo(0.1251 / 0.58, 10);
    expect(ev.profitable).toBe(true);
  });

  it('is +EV below break-even pot and -EV above it', () => {
    const { breakEvenPot } = computeGridMiningEv(base);
    expect(computeGridMiningEv({ ...base, pot: breakEvenPot * 0.5 }).profitable).toBe(true);
    expect(computeGridMiningEv({ ...base, pot: breakEvenPot * 2 }).profitable).toBe(false);
  });

  it('edge is independent of stake size', () => {
    const a = computeGridMiningEv({ ...base, stake: 0.01 });
    const b = computeGridMiningEv({ ...base, stake: 1 });
    expect(a.edgeRatio).toBeCloseTo(b.edgeRatio, 10);
    expect(a.breakEvenPot).toBeCloseTo(b.breakEvenPot, 10);
  });

  it('applies the refining fee only in cash-out mode', () => {
    const hold = computeGridMiningEv({ ...base, cashOut: false });
    const cash = computeGridMiningEv({ ...base, cashOut: true });
    expect(cash.slvrValueEth).toBeCloseTo(hold.slvrValueEth * 0.9, 12);
  });

  it('ignores the jackpot term when odds are non-finite', () => {
    const ev = computeGridMiningEv({ ...base, jackpotOdds: Infinity });
    expect(ev.jackpotEvEth).toBe(0);
  });

  it('throws on non-positive stake or pot', () => {
    expect(() => computeGridMiningEv({ ...base, stake: 0 })).toThrow();
    expect(() => computeGridMiningEv({ ...base, pot: 0 })).toThrow();
  });
});
