import { PublicClient, WalletClient, Address, formatEther } from 'viem';
import { SlvrConfig, PriceQuote } from './types';
import { SlvrGridLottery } from './contracts/lottery';
import { SlvrStaking } from './contracts/staking';
import { SlvrToken } from './contracts/token';
import { SlvrAutoCommit } from './contracts/autoCommit';
import { SlvrHub } from './contracts/hub';
import { SlvrGameRegistry } from './contracts/registry';
import { SlvrJackpot } from './contracts/jackpot';
import { SlvrPrice } from './price';
import { ChainlinkPriceFeed } from './oracle';
import { computeGridMiningEv, GridMiningEv } from './ev';
import { createSlvrClients, ConnectOptions } from './connect';
import { robinhood } from './deployments';
import { ValidationError } from './errors';

/**
 * Main Slvr SDK class
 * 
 * @example
 * ```typescript
 * import { createPublicClient, createWalletClient, http } from 'viem';
 * import { SlvrSDK } from '@slvr-labs/sdk';
 * 
 * const publicClient = createPublicClient({
 *   chain: robinhoodChain,
 *   transport: http(),
 * });
 * 
 * const walletClient = createWalletClient({
 *   chain: robinhoodChain,
 *   transport: http(),
 *   account: yourAccount,
 * });
 * 
 * const sdk = new SlvrSDK({
 *   publicClient,
 *   walletClient,
 *   addresses: {
 *     lottery: '0x...',
 *     staking: '0x...',
 *     token: '0x...',
 *   },
 * });
 * 
 * // Get current round
 * const roundId = await sdk.lottery.currentRoundId();
 * 
 * // Place a bet
 * await sdk.lottery.bet({
 *   roundId,
 *   squares: [0, 1, 2],
 *   amounts: [1000000000000000000n, 2000000000000000000n, 3000000000000000000n],
 * });
 * ```
 */
export class SlvrSDK {
  public readonly lottery: SlvrGridLottery;
  public readonly staking: SlvrStaking;
  public readonly token: SlvrToken;
  public readonly autoCommit?: SlvrAutoCommit;
  public readonly hub?: SlvrHub;
  public readonly registry?: SlvrGameRegistry;
  public readonly jackpot?: SlvrJackpot;
  /** SLVR/ETH spot price reader — present when a `slvrEthPair` address is configured. */
  public readonly price?: SlvrPrice;
  /** Chainlink ETH/USD feed reader — present when a `chainlinkEthUsd` address is configured. */
  public readonly ethUsd?: ChainlinkPriceFeed;

  private config: SlvrConfig;

  constructor(config: SlvrConfig) {
    this.config = config;

    // Initialize core contracts
    this.lottery = new SlvrGridLottery(
      config.publicClient,
      config.walletClient,
      config.addresses.lottery
    );

    this.staking = new SlvrStaking(
      config.publicClient,
      config.walletClient,
      config.addresses.staking
    );

    this.token = new SlvrToken(
      config.publicClient,
      config.walletClient,
      config.addresses.token
    );

    // Initialize optional contracts
    if (config.addresses.autoCommit) {
      this.autoCommit = new SlvrAutoCommit(
        config.publicClient,
        config.walletClient,
        config.addresses.autoCommit
      );
    }

    if (config.addresses.hub) {
      this.hub = new SlvrHub(
        config.publicClient,
        config.walletClient,
        config.addresses.hub
      );
    }

    if (config.addresses.registry) {
      this.registry = new SlvrGameRegistry(
        config.publicClient,
        config.walletClient,
        config.addresses.registry
      );
    }

    if (config.addresses.jackpot) {
      this.jackpot = new SlvrJackpot(
        config.publicClient,
        config.walletClient,
        config.addresses.jackpot
      );
    }

    // Price reader needs the pair address; SLVR side is resolved from the token address.
    if (config.addresses.slvrEthPair) {
      this.price = new SlvrPrice(
        config.publicClient,
        config.addresses.slvrEthPair,
        config.addresses.token
      );
    }

    // ETH/USD feed (optional; only on chains that have a Chainlink aggregator).
    if (config.addresses.chainlinkEthUsd) {
      this.ethUsd = new ChainlinkPriceFeed(config.publicClient, config.addresses.chainlinkEthUsd);
    }
  }

  /**
   * One-line setup: build clients (with Multicall3 batching + resilient transport
   * defaults) and an SDK for a deployment. Pass a `privateKey`/`account` to enable
   * writes; omit it for a read-only SDK.
   *
   * @example
   * ```typescript
   * import { SlvrSDK } from '@slvr-labs/sdk';
   * const sdk = SlvrSDK.connect();                                   // read-only, Robinhood Chain
   * const bot = SlvrSDK.connect({ privateKey: process.env.PK });     // wallet-backed
   * ```
   */
  static connect(opts: ConnectOptions = {}): SlvrSDK {
    const deployment = opts.deployment ?? robinhood;
    const { publicClient, walletClient } = createSlvrClients(opts);
    return new SlvrSDK({ publicClient, walletClient, addresses: deployment.addresses });
  }

  /**
   * Get the public client
   */
  getPublicClient(): PublicClient {
    return this.config.publicClient;
  }

  /**
   * Get the wallet client (if available)
   */
  getWalletClient(): WalletClient | undefined {
    return this.config.walletClient;
  }

  /**
   * Update the wallet client and reinitialize contracts
   * @param walletClient New wallet client (or undefined to remove)
   */
  setWalletClient(walletClient: WalletClient | undefined): void {
    this.config.walletClient = walletClient;
    
    // Reinitialize contracts with new wallet client
    this.lottery.setWalletClient(walletClient);
    this.staking.setWalletClient(walletClient);
    this.token.setWalletClient(walletClient);
    if (this.autoCommit) {
      this.autoCommit.setWalletClient(walletClient);
    }
    if (this.hub) {
      this.hub.setWalletClient(walletClient);
    }
    if (this.registry) {
      this.registry.setWalletClient(walletClient);
    }
    if (this.jackpot) {
      this.jackpot.setWalletClient(walletClient);
    }
  }

  /**
   * Helper: Calculate bet amounts from percentages
   * @param totalAmount Total amount to bet
   * @param percentages Array of percentages (0-100) for each square
   * @returns Array of amounts in wei
   * @throws ValidationError if percentages don't sum to 100 or if totalAmount is invalid
   */
  static calculateBetAmounts(totalAmount: bigint, percentages: number[]): bigint[] {
    if (percentages.length === 0) {
      throw new ValidationError('Percentages array cannot be empty', 'percentages');
    }
    
    const totalPercent = percentages.reduce((sum, p) => sum + p, 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      throw new ValidationError(`Percentages must sum to 100 (got ${totalPercent})`, 'percentages');
    }

    const amounts: bigint[] = [];
    let allocated = 0n;

    for (let i = 0; i < percentages.length; i++) {
      const percentage = percentages[i];
      if (percentage === undefined) continue;
      const amount = (totalAmount * BigInt(Math.round(percentage * 100))) / 10000n;
      amounts.push(amount);
      allocated += amount;
    }

    // Adjust first amount to account for rounding
    if (allocated !== totalAmount && amounts.length > 0 && amounts[0] !== undefined) {
      amounts[0] += totalAmount - allocated;
    }

    return amounts;
  }

  /**
   * Helper: Format bigint to human-readable string.
   *
   * `precision` caps the number of decimal places shown; trailing zeros are
   * stripped (like viem's `formatEther`), so `formatToken(1.5e18)` is `"1.5"`,
   * not `"1.5000"`.
   * @param value Value in wei
   * @param decimals Number of decimals (default 18)
   * @param precision Max decimal places to show (default 4)
   */
  static formatToken(value: bigint, decimals: number = 18, precision: number = 4): string {
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const remainder = value % divisor;
    const fractional = (remainder * BigInt(10 ** precision)) / divisor;

    if (fractional === 0n) {
      return whole.toString();
    }

    const fractionalStr = fractional.toString().padStart(precision, '0').replace(/0+$/, '');
    return fractionalStr ? `${whole}.${fractionalStr}` : whole.toString();
  }

  /**
   * Helper: Parse human-readable string to bigint
   * @param value Human-readable value (e.g., "1.5")
   * @param decimals Number of decimals (default 18)
   */
  static parseToken(value: string, decimals: number = 18): bigint {
    const parts = value.split('.');
    const whole = BigInt(parts[0] || '0');
    const fractional = parts[1] ? BigInt(parts[1].padEnd(decimals, '0').slice(0, decimals)) : 0n;
    return whole * BigInt(10 ** decimals) + fractional;
  }

  /**
   * Helper: Calculate time remaining until round ends
   * @param roundId Round ID
   * @returns Time remaining in seconds, or 0 if round has ended
   */
  async getTimeRemaining(roundId: bigint): Promise<number> {
    const roundEnd = await this.lottery.roundEnd(roundId);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const remaining = roundEnd - now;
    return remaining > 0n ? Number(remaining) : 0;
  }

  /**
   * Helper: Check if user can claim rewards for a round
   * @param roundId Round ID
   * @param user User address
   * @returns True if user can claim
   */
  async canClaim(roundId: bigint, user: Address): Promise<boolean> {
    const [round, hasClaimed_] = await Promise.all([
      this.lottery.getRound(roundId),
      this.lottery.getHasClaimed(roundId, user),
    ]);

    if (!round.resolved || hasClaimed_) {
      return false;
    }

    // Check if user has a bet on the winning square
    const userBet = await this.lottery.getUserBet(roundId, round.winningSquare, user);
    return userBet > 0n;
  }

  /**
   * Helper: Get user's claimable rounds
   * @param user User address
   * @param startRoundId Start round ID to check from
   * @param endRoundId End round ID to check to
   * @returns Array of round IDs that can be claimed
   */
  async getClaimableRounds(user: Address, startRoundId: bigint, endRoundId: bigint): Promise<bigint[]> {
    const claimable: bigint[] = [];

    for (let roundId = startRoundId; roundId <= endRoundId; roundId++) {
      if (await this.canClaim(roundId, user)) {
        claimable.push(roundId);
      }
    }

    return claimable;
  }

  /**
   * Helper: Compute a game's effective SLVR/sec emission rate.
   *
   * Mirrors SlvrHub._effectiveRatePerSec: the game's weighted share of the global emission stream,
   * i.e. emissionRatePerSec * weightOf(gameId) / totalActiveWeight. NOTE: this does not apply the
   * per-game maxWeightBps ceiling that the contract also enforces; it is the pre-cap weighted rate.
   *
   * Requires both `hub` and `registry` addresses to be configured.
   * @param gameId Registry game id
   * @returns Effective emission rate in SLVR/sec (0 if there is no active weight)
   */
  async effectiveEmissionRate(gameId: bigint): Promise<bigint> {
    if (!this.hub) {
      throw new ValidationError('hub address is required for effectiveEmissionRate', 'hub');
    }
    if (!this.registry) {
      throw new ValidationError('registry address is required for effectiveEmissionRate', 'registry');
    }

    const [rate, weight, totalWeight] = await Promise.all([
      this.hub.emissionRatePerSec(),
      this.registry.weightOf(gameId),
      this.registry.totalActiveWeight(),
    ]);

    if (totalWeight === 0n) {
      return 0n;
    }

    return (rate * weight) / totalWeight;
  }

  /**
   * Helper: Get the accrued-but-unminted SLVR emission currently available to a game.
   *
   * Thin pass-through to SlvrHub.pendingEmission. Requires `hub` to be configured.
   * @param gameId Registry game id
   */
  async pendingEmission(gameId: bigint): Promise<bigint> {
    if (!this.hub) {
      throw new ValidationError('hub address is required for pendingEmission', 'hub');
    }
    return await this.hub.pendingEmission(gameId);
  }

  /**
   * Helper: current SLVR spot price in ETH (ETH per SLVR).
   *
   * Requires a `slvrEthPair` address to be configured (so `sdk.price` exists).
   * @throws ValidationError if no pair address was configured.
   */
  async getSlvrPriceInEth(): Promise<number> {
    if (!this.price) {
      throw new ValidationError('slvrEthPair address is required for getSlvrPriceInEth', 'slvrEthPair');
    }
    return await this.price.getPriceInEth();
  }

  /**
   * Helper: current ETH price in USD from the configured Chainlink feed.
   *
   * Requires a `chainlinkEthUsd` address (so `sdk.ethUsd` exists). This is wired
   * for Robinhood Chain in `deployments.robinhood`; on chains without a feed,
   * supply one or pass `ethUsd` to {@link getSlvrPrice}.
   * @throws ValidationError if no ETH/USD feed was configured.
   */
  async getEthPriceUsd(): Promise<number> {
    if (!this.ethUsd) {
      throw new ValidationError('chainlinkEthUsd address is required for getEthPriceUsd', 'chainlinkEthUsd');
    }
    return await this.ethUsd.getPrice();
  }

  /**
   * Helper: current SLVR price in **both ETH and USD**.
   *
   * SLVR/ETH comes from the UniswapV2 pair (`sdk.price`). The USD value uses, in
   * order: an explicit `opts.ethUsd`, else the configured Chainlink ETH/USD feed
   * (`sdk.ethUsd`), else `usd` is `null`.
   *
   * @param opts.ethUsd override the ETH/USD price (e.g. from your own off-chain source)
   * @throws ValidationError if no `slvrEthPair` was configured.
   *
   * @example
   * ```typescript
   * const { eth, usd } = await sdk.getSlvrPrice();              // uses Chainlink feed if configured
   * const q = await sdk.getSlvrPrice({ ethUsd: 1797.35 });      // or supply ETH/USD yourself
   * ```
   */
  async getSlvrPrice(opts?: { ethUsd?: number }): Promise<PriceQuote> {
    if (!this.price) {
      throw new ValidationError('slvrEthPair address is required for getSlvrPrice', 'slvrEthPair');
    }
    const eth = await this.price.getPriceInEth();
    let ethUsd = opts?.ethUsd;
    if (ethUsd === undefined && this.ethUsd) {
      ethUsd = await this.ethUsd.getPrice();
    }
    return { eth, usd: ethUsd !== undefined ? eth * ethUsd : null };
  }

  /**
   * Helper: estimate the per-round expected value of grid mining for the given
   * stake, pulling live pot, emission and SLVR price on-chain.
   *
   * This is the SDK-level convenience around {@link computeGridMiningEv}: it reads
   * the round's pot (sum of all squares), the emission target (`slvrPerRound`), the
   * protocol fee (`protocolFeeBps`), and the SLVR price (via `sdk.price`), then
   * returns the full EV breakdown. Any of those can be overridden via `params`.
   *
   * The jackpot pool is **not** auto-read (it isn't exposed as a single call on the
   * live lottery) — pass `jackpotPool` if you want the jackpot term included.
   *
   * @remarks `slvrPerRound` is the emission *target*; actual emission is hub-gated
   * and may be lower, so treat the result as an upper-ish estimate. Requires a
   * configured `slvrEthPair` unless you pass `slvrPriceEth`.
   */
  async estimateRoundEv(params: {
    /** ETH to commit to the round. */
    stake: number;
    /** Round to price. Defaults to the current round. */
    roundId?: bigint;
    /** Value SLVR net of the refining fee (cashing out) vs at full price (holding). Default false. */
    cashOut?: boolean;
    /** ETH in the jackpot pool. Default 0 (jackpot term omitted). */
    jackpotPool?: number;
    /** Jackpot odds (1-in-N). Defaults to the protocol default (625). */
    jackpotOdds?: number;
    /** Override the emission target (SLVR/round). Defaults to `slvrPerRound()`. */
    emissionPerRound?: number;
    /** Override the SLVR price (ETH per SLVR). Defaults to `sdk.price`. */
    slvrPriceEth?: number;
    /** Override the pot (ETH). Defaults to the sum of the round's squares. */
    pot?: number;
  }): Promise<GridMiningEv> {
    const roundId = params.roundId ?? (await this.lottery.currentRoundId());

    const [potEth, emissionPerRound, slvrPriceEth, feeBps] = await Promise.all([
      params.pot !== undefined
        ? Promise.resolve(params.pot)
        : this.lottery
            .getRoundSquares(roundId)
            .then((sqs) => Number(formatEther(sqs.reduce((sum, s) => sum + s.total, 0n)))),
      params.emissionPerRound !== undefined
        ? Promise.resolve(params.emissionPerRound)
        : this.lottery.slvrPerRound().then((v) => Number(formatEther(v))),
      params.slvrPriceEth !== undefined
        ? Promise.resolve(params.slvrPriceEth)
        : this.getSlvrPriceInEth(),
      this.lottery.protocolFeeBps(),
    ]);

    return computeGridMiningEv({
      stake: params.stake,
      pot: potEth,
      emissionPerRound,
      slvrPriceEth,
      feeBps,
      cashOut: params.cashOut,
      jackpotPool: params.jackpotPool,
      jackpotOdds: params.jackpotOdds,
    });
  }
}

// Export all types
export * from './types';

// Export known deployments + ready-made viem chain
export * from './deployments';

// Export expected-value math + SLVR price reader
export * from './ev';
export { SlvrPrice } from './price';
export type { SlvrReserves } from './price';
export { ChainlinkPriceFeed } from './oracle';

// Export client factory
export { createSlvrClients, chainFromDeployment } from './connect';
export type { ConnectOptions, SlvrClients } from './connect';

// Export contract classes
export { SlvrGridLottery } from './contracts/lottery';
export { SlvrStaking } from './contracts/staking';
export { SlvrToken } from './contracts/token';
export { SlvrAutoCommit } from './contracts/autoCommit';
export { SlvrHub } from './contracts/hub';
export { SlvrGameRegistry } from './contracts/registry';
export { SlvrJackpot } from './contracts/jackpot';

// Export errors
export * from './errors';

// Export utilities
export * from './utils';

// Export transaction helpers
export * from './transaction';

// Export event utilities
export * from './events';

