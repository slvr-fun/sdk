import { Address, PublicClient, parseAbi } from 'viem';

/**
 * Reads a Chainlink-style price feed (`AggregatorV3Interface`).
 *
 * Works with any standard aggregator — the canonical use here is an **ETH/USD**
 * feed, which lets the SDK convert the pair-derived SLVR/ETH price into USD.
 *
 * Robinhood Chain has a Chainlink ETH/USD feed (`ETH / USD`, 8 decimals), wired
 * into `deployments.robinhood.addresses.chainlinkEthUsd`, so `sdk.ethUsd` and USD
 * prices work out of the box there. On chains without a feed, pass a USD price
 * into {@link SlvrSDK.getSlvrPrice} instead, or wire your own off-chain source.
 *
 * @example
 * ```typescript
 * import { ChainlinkPriceFeed } from '@slvr-labs/sdk';
 * const ethUsd = new ChainlinkPriceFeed(publicClient, ethUsdFeedAddress);
 * const price = await ethUsd.getPrice(); // e.g. 1797.35
 * ```
 */
export class ChainlinkPriceFeed {
  private publicClient: PublicClient;
  private feedAddress: Address;
  private maxStalenessSec?: number;

  private static readonly ABI = parseAbi([
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  ]);

  /**
   * @param publicClient viem public client
   * @param feedAddress the aggregator address
   * @param opts.maxStalenessSec if set, {@link getPrice} throws when the feed's
   *   `updatedAt` is older than this many seconds (checked against the local
   *   clock). Off by default — enable it only where the local clock is trusted.
   */
  constructor(
    publicClient: PublicClient,
    feedAddress: Address,
    opts?: { maxStalenessSec?: number }
  ) {
    this.publicClient = publicClient;
    this.feedAddress = feedAddress;
    this.maxStalenessSec = opts?.maxStalenessSec;
  }

  /** Raw `latestRoundData` answer plus the feed's decimals. */
  async getRoundData(): Promise<{ answer: bigint; decimals: number; updatedAt: bigint }> {
    const [decimals, roundData] = await Promise.all([
      this.publicClient.readContract({
        address: this.feedAddress,
        abi: ChainlinkPriceFeed.ABI,
        functionName: 'decimals',
      }) as Promise<number>,
      this.publicClient.readContract({
        address: this.feedAddress,
        abi: ChainlinkPriceFeed.ABI,
        functionName: 'latestRoundData',
      }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint]>,
    ]);
    return { answer: roundData[1], decimals, updatedAt: roundData[3] };
  }

  /**
   * The feed price as a floating-point number (`answer / 10 ** decimals`).
   * @throws {Error} if the answer is non-positive, or (when `maxStalenessSec` is
   *   set) if the feed is stale.
   */
  async getPrice(): Promise<number> {
    const { answer, decimals, updatedAt } = await this.getRoundData();
    if (answer <= 0n) {
      throw new Error(`Chainlink feed ${this.feedAddress} returned a non-positive answer`);
    }
    if (this.maxStalenessSec !== undefined) {
      const nowSec = Math.floor(Date.now() / 1000);
      const age = nowSec - Number(updatedAt);
      if (age > this.maxStalenessSec) {
        throw new Error(
          `Chainlink feed ${this.feedAddress} is stale: ${age}s old (max ${this.maxStalenessSec}s)`
        );
      }
    }
    return Number(answer) / 10 ** decimals;
  }
}
