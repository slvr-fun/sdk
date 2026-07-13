import { Address, parseAbi, PublicClient, WalletClient } from 'viem';

/**
 * SlvrJackpot contract interface (read-only pool surface).
 */
export class SlvrJackpot {
  private publicClient: PublicClient;
  private address: Address;

  private static readonly ABI = parseAbi([
    'function jackpotPool() view returns (uint256)',
    'function jackpotSlvrPool() view returns (uint256)',
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(publicClient: PublicClient, _walletClient: WalletClient | undefined, address: Address) {
    this.publicClient = publicClient;
    this.address = address;
  }

  /** Read-only contract: no wallet client needed. Kept for a consistent SDK surface. */
  setWalletClient(_walletClient: WalletClient | undefined): void {
    // no-op
  }

  /**
   * Native (ETH) jackpot pool balance
   */
  async jackpotPool(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrJackpot.ABI,
      functionName: 'jackpotPool',
    }) as bigint;
  }

  /**
   * SLVR jackpot pool balance
   */
  async jackpotSlvrPool(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrJackpot.ABI,
      functionName: 'jackpotSlvrPool',
    }) as bigint;
  }
}
