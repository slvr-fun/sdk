/**
 * Example: Expected-value grid-mining bot
 *
 * This bot only bets when the round is **+EV** — i.e. the expected value of
 * mining SLVR (plus the jackpot term) exceeds the ETH you bleed to the protocol
 * fee. It uses the SDK's built-in grid-mining calculator (`computeGridMiningEv` /
 * `sdk.estimateRoundEv`) and the SDK's SLVR price reader (`sdk.price`), so the
 * math matches the protocol's own edge calculator.
 *
 * How the decision works (see the docs on `computeGridMiningEv` for the full
 * model):
 *   - SLVR mined/round ≈ (stake / pot) * emissionPerRound
 *   - ETH bleed/round   = feeFraction * stake        (you get the rest of the pot back pro-rata)
 *   - net EV/round      = slvrValue - bleed + jackpotEV
 * Because both terms scale with your stake, the edge depends on **pot vs SLVR
 * price**, not on bet size: mining is profitable while the pot is *below* the
 * break-even pot. This bot bets when net EV per round clears a threshold.
 *
 * When it bets, it spreads the stake across all 25 squares in proportion to the
 * current pot — the coverage the EV model assumes, so you hold a `stake/pot`
 * slice of whichever square wins. (Tilting toward the least-allocated squares —
 * see `least-allocated-strategy.ts` — would raise SLVR yield *above* this
 * estimate, so treating this EV as a floor is conservative.)
 *
 * Run: set PRIVATE_KEY and `ts-node expected-value-strategy.ts` (or import the
 * class). To adapt into your own project, change the `../src` import to
 * `@slvr-labs/sdk`.
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SlvrSDK, robinhoodChain, deployments, GRID_SIZE, type GridMiningEv } from '../src';

export interface ExpectedValueBotOptions {
  /** ETH to commit per round. Default: 0.1 ETH. */
  stakeEth?: number;
  /** Minimum net EV (in ETH per round) required to bet. Default: 0 (bet on any +EV round). */
  minNetEth?: number;
  /** Value SLVR net of the 10% refining fee (cashing out) vs at full price (holding). Default: false (hold). */
  cashOut?: boolean;
  /** ETH currently in the jackpot pool, to include the jackpot term. Default: 0. */
  jackpotPool?: number;
  /** Jackpot odds (1-in-N). Default: the protocol default (625). */
  jackpotOdds?: number;
  /**
   * ETH/USD price override, for logging values in USD. If omitted, the bot uses
   * the SDK's Chainlink feed (`sdk.ethUsd`) — which is wired for Robinhood Chain,
   * so USD figures show automatically. Set this only to override the feed or on a
   * chain that lacks one.
   */
  ethUsd?: number;
  /** How often to check, in milliseconds. Default: 5000. */
  checkInterval?: number;
}

/**
 * A bot that mines the grid only when the expected value is positive.
 */
export class ExpectedValueBot {
  private sdk: SlvrSDK;
  private stakeEth: number;
  private minNetEth: number;
  private cashOut: boolean;
  private jackpotPool: number;
  private jackpotOdds: number | undefined;
  private ethUsd: number | undefined;
  private checkInterval: number;
  private isRunning = false;
  private intervalId?: ReturnType<typeof setInterval>;
  private lastBetRound?: bigint;

  constructor(sdk: SlvrSDK, options: ExpectedValueBotOptions = {}) {
    this.sdk = sdk;
    this.stakeEth = options.stakeEth ?? 0.1;
    this.minNetEth = options.minNetEth ?? 0;
    this.cashOut = options.cashOut ?? false;
    this.jackpotPool = options.jackpotPool ?? 0;
    this.jackpotOdds = options.jackpotOdds;
    this.ethUsd = options.ethUsd;
    this.checkInterval = options.checkInterval ?? 5000;
  }

  /** Evaluate the current round once: log the EV breakdown and bet if it clears the threshold. */
  async checkOnce(): Promise<GridMiningEv | null> {
    const roundId = await this.sdk.lottery.currentRoundId();

    // SLVR price in both ETH and USD (USD needs an ETH/USD source — the SDK's
    // Chainlink feed if configured, else the `ethUsd` option; otherwise null).
    const price = await this.sdk.getSlvrPrice({ ethUsd: this.ethUsd });
    console.log(
      `SLVR price: ${price.eth.toExponential(4)} ETH` +
        (price.usd !== null ? ` · $${price.usd.toFixed(4)}` : ' · (USD unavailable — no ETH/USD source)')
    );

    // Compute the expected value for this round (pulls pot, emission and SLVR price on-chain).
    const ev = await this.sdk.estimateRoundEv({
      stake: this.stakeEth,
      roundId,
      cashOut: this.cashOut,
      jackpotPool: this.jackpotPool,
      jackpotOdds: this.jackpotOdds,
      slvrPriceEth: price.eth, // reuse the price we just read
    });

    // Derive the ETH/USD we ended up using, to also show net EV in USD.
    const ethUsd = price.usd !== null ? price.usd / price.eth : null;
    const netUsd = ethUsd !== null ? ` (${ev.netEth * ethUsd >= 0 ? '+' : ''}$${(ev.netEth * ethUsd).toFixed(4)})` : '';

    console.log(
      `Round ${roundId}: share ${(ev.share * 100).toFixed(2)}% · ` +
        `mine ${ev.slvrMined.toFixed(4)} SLVR (${ev.slvrValueEth.toFixed(6)} ETH) · ` +
        `bleed ${ev.ethBleed.toFixed(6)} ETH · jackpot +${ev.jackpotEvEth.toFixed(6)} ETH · ` +
        `NET ${ev.netEth >= 0 ? '+' : ''}${ev.netEth.toFixed(6)} ETH/round${netUsd} ` +
        `(edge ${(ev.edgeRatio * 100).toFixed(2)}%, break-even pot ${ev.breakEvenPot.toFixed(4)} ETH)`
    );

    if (this.lastBetRound === roundId) {
      console.log('  already bet this round — skipping');
      return ev;
    }

    if (ev.netEth < this.minNetEth) {
      console.log(
        `  skip: net EV ${ev.netEth.toFixed(6)} < threshold ${this.minNetEth} ETH ` +
          `(pot above break-even — wait for it to shrink or SLVR to rise)`
      );
      return ev;
    }

    if (!(await this.sdk.lottery.roundOpen(roundId))) {
      console.log('  skip: round is not open for betting');
      return ev;
    }

    await this.placeGridBet(roundId);
    this.lastBetRound = roundId;
    return ev;
  }

  /**
   * Spread the stake across all {@link GRID_SIZE} squares in proportion to the
   * current pot (with a floor so every square is covered and we always hold the
   * winner). This is the coverage the grid-mining EV model assumes.
   */
  private async placeGridBet(roundId: bigint): Promise<void> {
    const stakeWei = parseEther(this.stakeEth.toString());

    const squaresData = await this.sdk.lottery.getRoundSquares(roundId);
    const totals: bigint[] = Array.from(
      { length: GRID_SIZE },
      (_, i) => squaresData.find((s) => s.square === i)?.total ?? 0n
    );
    const sumTotals = totals.reduce((a, b) => a + b, 0n);

    // Floor keeps empty squares covered so we never miss the winning square.
    const floor = sumTotals / BigInt(GRID_SIZE) + 1n;
    const weights = totals.map((t) => t + floor);
    const sumWeights = weights.reduce((a, b) => a + b, 0n);

    const amounts = weights.map((w) => (stakeWei * w) / sumWeights);
    // Push any rounding dust onto the first square so the amounts sum to exactly stakeWei.
    const allocated = amounts.reduce((a, b) => a + b, 0n);
    amounts[0] = (amounts[0] ?? 0n) + (stakeWei - allocated);

    const squares = Array.from({ length: GRID_SIZE }, (_, i) => i);

    console.log(`  betting ${formatEther(stakeWei)} ETH across all ${GRID_SIZE} squares…`);
    const txHash = await this.sdk.lottery.bet({ roundId, squares, amounts });
    console.log(`  ✅ bet placed: ${txHash}`);
  }

  /** Start the polling loop. */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Bot is already running');
      return;
    }
    if (!this.sdk.getWalletClient()) {
      throw new Error('Wallet client required for expected-value betting');
    }

    this.isRunning = true;
    console.log('📈 Expected-value bot started');
    console.log(
      `Stake ${this.stakeEth} ETH/round · bet when net EV ≥ ${this.minNetEth} ETH · ` +
        `mode ${this.cashOut ? 'cash-out (−10% refine)' : 'hold'}`
    );

    const tick = async () => {
      try {
        await this.checkOnce();
      } catch (err) {
        console.error('  error during check:', err instanceof Error ? err.message : err);
      }
    };

    await tick();
    this.intervalId = setInterval(tick, this.checkInterval);
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    console.log('🛑 Expected-value bot stopped');
  }
}

/**
 * Runnable entry point: builds a wallet-backed SDK on Robinhood Chain (using the
 * shipped `deployments` + `robinhoodChain`) and starts the bot.
 */
export async function exampleExpectedValueBot(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
  const walletClient = createWalletClient({ chain: robinhoodChain, transport: http(), account });

  // deployments.robinhood.addresses includes slvrEthPair, so sdk.price is available.
  const sdk = new SlvrSDK({
    publicClient,
    walletClient,
    addresses: deployments.robinhood.addresses,
  });

  const bot = new ExpectedValueBot(sdk, {
    stakeEth: 0.1, // commit 0.1 ETH per +EV round
    minNetEth: 0, // bet on any positive-EV round
    cashOut: false, // value mined SLVR at full price (holding/staking it)
    // USD comes from the SDK's Chainlink ETH/USD feed automatically on Robinhood
    // Chain. Set ETH_USD to override it (e.g. `ETH_USD=1815 ts-node …`).
    ethUsd: process.env.ETH_USD ? Number(process.env.ETH_USD) : undefined,
    checkInterval: 5000,
  });

  await bot.start();

  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, stopping bot…');
    bot.stop();
    process.exit(0);
  });
}

// Run directly: `PRIVATE_KEY=0x... ts-node expected-value-strategy.ts`
if (require.main === module) {
  exampleExpectedValueBot().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
