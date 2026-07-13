/**
 * Expected-value math for SLVR grid mining.
 *
 * This is a direct port of the protocol's "grid-mining edge" model — the same
 * math the web calculator uses — so an SDK bot and the site agree.
 *
 * ## The model
 *
 * The winning square each round is chosen **uniformly** at random over the
 * {@link GRID_SIZE}-square grid (`randomnessValue % 25`), independent of how much
 * was wagered where. Wagers only decide how the pot is split *among* the winners.
 *
 * The strategy this models is **grid mining**: spread your stake across the grid
 * in proportion to the current pot so you always hold a `share = stake / pot`
 * slice of whichever square wins. Under that strategy, per round:
 *
 * - **ETH is a wash minus the protocol fee.** The whole pot minus the fee is paid
 *   pro-rata to the winning square, and your slice of it equals your slice of the
 *   pot — i.e. you get back `(1 - fee) * stake` in expectation. So your ETH cost
 *   ("bleed") is exactly `feeFraction * stake`.
 * - **SLVR is mined pro-rata:** `slvrMined = share * emissionPerRound`. (Whether a
 *   round is "single-miner" — winner-take-all SLVR — changes the *variance*, not
 *   the mean, so it does not affect EV.)
 * - **Jackpot** pays your `share` of the pool with probability `1 / jackpotOdds`.
 *
 * Net EV per round (in ETH):
 *
 * ```
 * netEth = slvrMined * slvrPriceEth * realize   // SLVR value (realize = 1 - refineFee when cashing out)
 *        - feeFraction * stake                   // ETH bleed
 *        + (1 / jackpotOdds) * share * jackpotPool
 * ```
 *
 * Because both the SLVR reward and the bleed scale with `stake`, **the edge does
 * not depend on how much you bet** — only on `pot` vs `slvrPriceEth`. A smaller
 * pot means a bigger `share`, so mining is profitable while the pot is *below* the
 * {@link GridMiningEv.breakEvenPot break-even pot}.
 */

/** Grid size — the winning square is `randomnessValue % GRID_SIZE`. */
export const GRID_SIZE = 25;

/** Probability any one square wins a round (uniform selection). */
export const SINGLE_SQUARE_WIN_PROBABILITY = 1 / GRID_SIZE;

/** Default protocol fee in basis points (10%), taken out of the pot before winners. */
export const PROTOCOL_FEE_BPS = 1000;

/** Default SLVR refining fee in basis points (10%), charged when you cash SLVR out to ETH. */
export const REFINING_FEE_BPS = 1000;

/** Default jackpot odds — the jackpot fires when `randomnessValue % JACKPOT_ODDS == 0`. */
export const JACKPOT_ODDS = 625;

/**
 * Inputs to {@link computeGridMiningEv}. All ETH-denominated values are plain
 * numbers in whole ETH (not wei) and `slvrPriceEth` is ETH per SLVR — use
 * `Number(formatEther(...))` to convert on-chain `bigint` wei.
 */
export interface GridMiningEvInput {
  /** ETH you would commit to the round. */
  stake: number;
  /** Total ETH currently wagered in the round (the pot). */
  pot: number;
  /** SLVR minted to the winning square this round (the emission target). */
  emissionPerRound: number;
  /** Price of SLVR in ETH (ETH per SLVR). */
  slvrPriceEth: number;
  /** Protocol fee in bps. Defaults to {@link PROTOCOL_FEE_BPS} (1000 = 10%). */
  feeBps?: number;
  /**
   * If `true`, value mined SLVR net of the refining fee (you intend to cash out
   * to ETH). If `false` (default), value it at full price (you hold/stake it).
   */
  cashOut?: boolean;
  /** Refining fee in bps, applied only when `cashOut` is true. Defaults to {@link REFINING_FEE_BPS}. */
  refineFeeBps?: number;
  /** ETH currently in the jackpot pool. Defaults to 0 (jackpot ignored). */
  jackpotPool?: number;
  /** Jackpot odds (1-in-N per round). Defaults to {@link JACKPOT_ODDS} (625). */
  jackpotOdds?: number;
}

/** Result of {@link computeGridMiningEv}. All ETH-denominated. */
export interface GridMiningEv {
  /** Your fraction of the pot, `stake / pot`. */
  share: number;
  /** ETH lost per round to the protocol fee, `feeFraction * stake`. */
  ethBleed: number;
  /** SLVR mined per round, `share * emissionPerRound`. */
  slvrMined: number;
  /** ETH value of the mined SLVR after the realize factor. */
  slvrValueEth: number;
  /** Expected jackpot contribution per round, in ETH. */
  jackpotEvEth: number;
  /** Net EV per round excluding the jackpot, in ETH. */
  netEthNoJackpot: number;
  /** Net EV per round including the jackpot, in ETH. */
  netEth: number;
  /** Net EV as a fraction of stake (`netEth / stake`) — the per-round edge. */
  edgeRatio: number;
  /** Pot size at which `netEth` crosses zero. Mining is profitable below this. */
  breakEvenPot: number;
  /** SLVR price (ETH) at which `netEth` crosses zero for the current pot. */
  breakEvenSlvrPriceEth: number;
  /** Whether the round is +EV (`netEth > 0`). */
  profitable: boolean;
}

/**
 * Compute the per-round expected value of grid mining for a given stake, pot,
 * emission and SLVR price. Pure function — does no I/O.
 *
 * @throws {Error} if `stake` or `pot` is not positive.
 *
 * @example
 * ```typescript
 * import { computeGridMiningEv } from '@slvr-labs/sdk';
 *
 * const ev = computeGridMiningEv({
 *   stake: 0.1,            // 0.1 ETH per round
 *   pot: 0.5,              // 0.5 ETH in the pot
 *   emissionPerRound: 1,   // 1 SLVR minted/round
 *   slvrPriceEth: 0.0005,  // SLVR price in ETH
 *   jackpotPool: 5,        // 5 ETH jackpot
 * });
 * if (ev.profitable) console.log(`+${ev.netEth} ETH/round, edge ${(ev.edgeRatio * 100).toFixed(1)}%`);
 * ```
 */
export function computeGridMiningEv(input: GridMiningEvInput): GridMiningEv {
  const {
    stake,
    pot,
    emissionPerRound,
    slvrPriceEth,
    feeBps = PROTOCOL_FEE_BPS,
    cashOut = false,
    refineFeeBps = REFINING_FEE_BPS,
    jackpotPool = 0,
    jackpotOdds = JACKPOT_ODDS,
  } = input;

  if (!(stake > 0)) throw new Error(`stake must be positive (got ${stake})`);
  if (!(pot > 0)) throw new Error(`pot must be positive (got ${pot})`);

  const feeFraction = feeBps / 10_000;
  const realize = cashOut ? 1 - refineFeeBps / 10_000 : 1;

  const share = stake / pot;
  const ethBleed = feeFraction * stake;
  const slvrMined = share * emissionPerRound;
  const slvrValueEth = slvrMined * slvrPriceEth * realize;

  // Jackpot is ignored when odds are non-finite/non-positive or the pool is empty.
  const jackpotEvEth =
    jackpotOdds > 0 && Number.isFinite(jackpotOdds) ? (1 / jackpotOdds) * share * jackpotPool : 0;

  const netEthNoJackpot = slvrValueEth - ethBleed;
  const netEth = netEthNoJackpot + jackpotEvEth;

  // Solve netEth == 0 for pot and for slvrPriceEth (both independent of stake).
  // netEth = (stake/pot)*(emit*price*realize + jackpotPool/odds) - feeFraction*stake
  const perShareEthReward =
    emissionPerRound * slvrPriceEth * realize +
    (jackpotOdds > 0 && Number.isFinite(jackpotOdds) ? jackpotPool / jackpotOdds : 0);
  const breakEvenPot = feeFraction > 0 ? perShareEthReward / feeFraction : Infinity;

  // Solve for the SLVR price that makes netEth == 0 at the current pot.
  const slvrRewardDenom = share * emissionPerRound * realize;
  const breakEvenSlvrPriceEth =
    slvrRewardDenom > 0 ? (ethBleed - jackpotEvEth) / slvrRewardDenom : Infinity;

  return {
    share,
    ethBleed,
    slvrMined,
    slvrValueEth,
    jackpotEvEth,
    netEthNoJackpot,
    netEth,
    edgeRatio: netEth / stake,
    breakEvenPot,
    breakEvenSlvrPriceEth,
    profitable: netEth > 0,
  };
}
