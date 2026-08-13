import { Address, parseAbi, PublicClient, WalletClient } from 'viem';
import { WalletClientRequiredError } from '../errors';

/**
 * SlvrMinerVault — where mined SLVR lives, from the round-33500 generation onward.
 *
 * Before this contract, each lottery generation held its own miner state, so every protocol
 * upgrade stranded unrefined SLVR on a retired contract. The vault holds it instead: one position
 * per wallet — unrefined SLVR, accrued dividends and the refining clock — written to by whichever
 * game generations are currently authorized, and untouched by any future cutover.
 *
 * What this means for SDK consumers:
 *
 * - Reads are unchanged in spirit: `getMinerState` here is the same shape the lottery has always
 *   returned (and vault-era lotteries proxy their own `getMinerState` to this contract).
 * - CASHING OUT MOVED. Vault-era lotteries have no `withdrawUnrefinedSlvr`; call
 *   {@link SlvrMinerVault.withdraw} instead. It settles the caller's whole position: unrefined
 *   SLVR less the refining fee, plus accrued dividends (never fee'd).
 * - The refining fee is unchanged: 20% on fresh SLVR decaying to 10% over 24 hours, applied at
 *   the position's blended clock. Mining more does not reset the clock; it blends by weight.
 */
export class SlvrMinerVault {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private address: Address;

  private static readonly ABI = parseAbi([
    'function getMinerState(address miner) view returns (uint256 rewardsSlvr, uint256 indexSnapshot, uint256 refinedAccrued, uint64 refineClock)',
    'function pendingDividends(address miner) view returns (uint256)',
    'function getRefiningFee(address miner) view returns (uint256 fee, uint64 refineClock)',
    'function quoteRefiningFee(address miner, uint256 amount) view returns (uint256)',
    'function minerIndex() view returns (uint256)',
    'function totalUnclaimed() view returns (uint256)',
    'function totalRefined() view returns (uint256)',
    'function solvency() view returns (uint256)',
    'function migrationWindowOpened() view returns (bool)',
    'function migrationWindowEnds() view returns (uint64)',
    'function hasMigrated(address) view returns (bool)',
    'function withdraw() returns (uint256 payout, uint256 refiningFee)',
    'function migrateIn(uint256 amount) returns (uint256 credited)',
    'function checkpoint(address miner)',
  ]);

  constructor(publicClient: PublicClient, walletClient: WalletClient | undefined, address: Address) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
  }

  setWalletClient(walletClient: WalletClient | undefined): void {
    this.walletClient = walletClient;
  }

  /**
   * A wallet's whole mining position: unrefined SLVR, its dividend snapshot, dividends already
   * attributed, and the refining clock that prices the exit fee.
   */
  async getMinerState(miner: Address): Promise<{
    rewardsSlvr: bigint;
    indexSnapshot: bigint;
    refinedAccrued: bigint;
    refineClock: bigint;
  }> {
    const [rewardsSlvr, indexSnapshot, refinedAccrued, refineClock] =
      await this.publicClient.readContract({
        address: this.address,
        abi: SlvrMinerVault.ABI,
        functionName: 'getMinerState',
        args: [miner],
      });
    return { rewardsSlvr, indexSnapshot, refinedAccrued, refineClock: BigInt(refineClock) };
  }

  /**
   * Dividends earned but not yet checkpointed — the live figure, no transaction needed.
   * Dividends are other miners' refining fees and are never taxed on the way out.
   */
  async pendingDividends(miner: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrMinerVault.ABI,
      functionName: 'pendingDividends',
      args: [miner],
    });
  }

  /**
   * What cashing out the whole position would cost right now, in absolute SLVR.
   * 20% of the unrefined balance at age zero, sliding to 10% once the blended clock
   * reads 24 hours old.
   */
  async getRefiningFee(miner: Address): Promise<{ fee: bigint; refineClock: bigint }> {
    const [fee, refineClock] = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrMinerVault.ABI,
      functionName: 'getRefiningFee',
      args: [miner],
    });
    return { fee, refineClock: BigInt(refineClock) };
  }

  /**
   * Cash out everything: unrefined SLVR less its refining fee, plus accrued dividends.
   * This replaces the lottery's `withdrawUnrefinedSlvr` from the round-33500 generation on.
   * Settles the caller's own position; there is no withdrawing on someone else's behalf.
   */
  async withdraw(): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('withdrawing mined SLVR from the vault');
    }
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrMinerVault.ABI,
      functionName: 'withdraw',
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * The one-time migration window: deposit SLVR you already hold and have it become a mining
   * position, on the same terms as freshly mined SLVR (fresh clock, no retroactive dividends).
   * One deposit per address, ever; requires a prior ERC-20 approval to the vault. Reverts once
   * the window has closed — check {@link migrationWindow} first.
   */
  async migrateIn(amount: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('depositing through the migration window');
    }
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrMinerVault.ABI,
      functionName: 'migrateIn',
      args: [amount],
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /** The migration window's state: whether it was ever opened, and when it closes. */
  async migrationWindow(): Promise<{ opened: boolean; endsAt: bigint; isOpen: boolean }> {
    const [opened, endsAt] = await Promise.all([
      this.publicClient.readContract({
        address: this.address,
        abi: SlvrMinerVault.ABI,
        functionName: 'migrationWindowOpened',
      }),
      this.publicClient.readContract({
        address: this.address,
        abi: SlvrMinerVault.ABI,
        functionName: 'migrationWindowEnds',
      }),
    ]);
    const endsAtBig = BigInt(endsAt);
    return {
      opened,
      endsAt: endsAtBig,
      isOpen: opened && endsAtBig > BigInt(Math.floor(Date.now() / 1000)),
    };
  }

  /** Whether a wallet has used its one migration deposit. Never resets. */
  async hasMigrated(miner: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrMinerVault.ABI,
      functionName: 'hasMigrated',
      args: [miner],
    });
  }

  /**
   * SLVR held beyond everything owed. The invariant the vault's accounting rests on, as one
   * read: zero is healthy, and anything else is surplus.
   */
  async solvency(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrMinerVault.ABI,
      functionName: 'solvency',
    });
  }
}
