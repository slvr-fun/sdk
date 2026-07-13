import { Address, PublicClient, parseAbi } from 'viem';

/**
 * Reserves of the SLVR/ETH UniswapV2 pair, with the token ordering resolved.
 */
export interface SlvrReserves {
  /** SLVR reserve, in wei (18 decimals). */
  slvrReserve: bigint;
  /** ETH (WETH) reserve, in wei (18 decimals). */
  ethReserve: bigint;
  /** Whether SLVR is `token0` in the pair (ordering is resolved for you). */
  token0IsSlvr: boolean;
}

/**
 * Reads the SLVR price from the SLVR/ETH UniswapV2 pair.
 *
 * Mirrors the web app's price logic: it reads the pair's `getReserves()` and
 * `token0()`, figures out which reserve is SLVR (never assumes ordering), and
 * prices SLVR as `ethReserve / slvrReserve`. Both tokens are 18-decimal, so the
 * raw reserve ratio is already ETH-per-SLVR.
 *
 * This is a **spot** price straight from reserves — no TWAP, no slippage model.
 * Fine for sizing bets and EV estimates; do not use it as an oracle for anything
 * that must resist manipulation.
 *
 * @example
 * ```typescript
 * import { SlvrPrice } from '@slvr-labs/sdk';
 * const price = new SlvrPrice(publicClient, pairAddress, slvrTokenAddress);
 * const ethPerSlvr = await price.getPriceInEth();
 * ```
 */
export class SlvrPrice {
  private publicClient: PublicClient;
  private pairAddress: Address;
  private slvrTokenAddress: Address;

  private static readonly PAIR_ABI = parseAbi([
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
  ]);

  constructor(publicClient: PublicClient, pairAddress: Address, slvrTokenAddress: Address) {
    this.publicClient = publicClient;
    this.pairAddress = pairAddress;
    this.slvrTokenAddress = slvrTokenAddress;
  }

  /** Read the pair reserves and resolve which side is SLVR. */
  async getReserves(): Promise<SlvrReserves> {
    const [reserves, token0] = await Promise.all([
      this.publicClient.readContract({
        address: this.pairAddress,
        abi: SlvrPrice.PAIR_ABI,
        functionName: 'getReserves',
      }) as Promise<readonly [bigint, bigint, number]>,
      this.publicClient.readContract({
        address: this.pairAddress,
        abi: SlvrPrice.PAIR_ABI,
        functionName: 'token0',
      }) as Promise<Address>,
    ]);

    const token0IsSlvr = token0.toLowerCase() === this.slvrTokenAddress.toLowerCase();
    const slvrReserve = token0IsSlvr ? reserves[0] : reserves[1];
    const ethReserve = token0IsSlvr ? reserves[1] : reserves[0];
    return { slvrReserve, ethReserve, token0IsSlvr };
  }

  /**
   * SLVR price in ETH (ETH per SLVR), as a floating-point number.
   * @throws {Error} if the pair has no SLVR liquidity (zero reserve).
   */
  async getPriceInEth(): Promise<number> {
    const { slvrReserve, ethReserve } = await this.getReserves();
    if (slvrReserve === 0n) {
      throw new Error('SLVR/ETH pair has zero SLVR reserve; cannot price');
    }
    return Number(ethReserve) / Number(slvrReserve);
  }

  /**
   * SLVR price in ETH as a WAD (1e18-scaled `bigint`), for callers that want to
   * stay in integer math: `priceWad = ethReserve * 1e18 / slvrReserve`.
   * @throws {Error} if the pair has no SLVR liquidity (zero reserve).
   */
  async getPriceInEthWad(): Promise<bigint> {
    const { slvrReserve, ethReserve } = await this.getReserves();
    if (slvrReserve === 0n) {
      throw new Error('SLVR/ETH pair has zero SLVR reserve; cannot price');
    }
    return (ethReserve * 10n ** 18n) / slvrReserve;
  }
}
