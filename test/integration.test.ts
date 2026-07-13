import { describe, it, expect } from 'vitest';
import { SlvrSDK, GRID_SIZE } from '../src';

/**
 * Live/fork integration test. Skipped unless `SLVR_TEST_RPC` is set, so CI stays
 * offline-safe. To run it against a local fork of Robinhood Chain:
 *
 *   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8546 &
 *   SLVR_TEST_RPC=http://127.0.0.1:8546 npm test
 *
 * or against the live chain:
 *
 *   SLVR_TEST_RPC=https://rpc.mainnet.chain.robinhood.com npm test
 */
const RPC = process.env.SLVR_TEST_RPC;

describe.skipIf(!RPC)('integration (reads against a live/fork RPC)', () => {
  const sdk = SlvrSDK.connect({ rpcUrl: RPC });

  it('reads the current round', { timeout: 30_000 }, async () => {
    const roundId = await sdk.lottery.currentRoundId();
    expect(roundId).toBeGreaterThan(0n);
  });

  it('reads all 25 squares in one multicall, and the pot matches getRound', { timeout: 30_000 }, async () => {
    const roundId = await sdk.lottery.currentRoundId();
    const [squares, round] = await Promise.all([
      sdk.lottery.getRoundSquares(roundId),
      sdk.lottery.getRound(roundId),
    ]);
    expect(squares).toHaveLength(GRID_SIZE);
    const pot = squares.reduce((a, s) => a + s.total, 0n);
    expect(pot).toBe(round.totalWager);
  });

  it('prices SLVR in ETH and USD, and reads the Chainlink feed', { timeout: 30_000 }, async () => {
    const [price, ethUsd] = await Promise.all([sdk.getSlvrPrice(), sdk.getEthPriceUsd()]);
    expect(price.eth).toBeGreaterThan(0);
    expect(price.usd).toBeGreaterThan(0);
    expect(ethUsd).toBeGreaterThan(0);
  });

  it('estimates round EV with a full breakdown', { timeout: 30_000 }, async () => {
    const ev = await sdk.estimateRoundEv({ stake: 0.1 });
    expect(ev.breakEvenPot).toBeGreaterThan(0);
    expect(typeof ev.profitable).toBe('boolean');
  });

  it('returns a batched round-state snapshot with block-time based countdown', { timeout: 30_000 }, async () => {
    const s = await sdk.lottery.getRoundState();
    expect(s.roundId).toBeGreaterThan(0n);
    expect(typeof s.open).toBe('boolean');
    expect(typeof s.resolved).toBe('boolean');
    expect(s.secondsUntilBettingClose).toBeGreaterThanOrEqual(0);
    expect(s.bettingEnd).toBeGreaterThan(0n);
  });

  it('getTimeRemaining uses chain time and is non-negative', { timeout: 30_000 }, async () => {
    const roundId = await sdk.lottery.currentRoundId();
    const t = await sdk.getTimeRemaining(roundId);
    expect(t).toBeGreaterThanOrEqual(0);
  });
});
