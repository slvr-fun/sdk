import { Address, parseAbi, PublicClient, WalletClient } from 'viem';

/**
 * SlvrHub contract interface (read-only).
 *
 * The hub is the protocol emission/sink router: it gates per-game SLVR emission, fans many games
 * into one shared veNFT staker stream, and into one shared jackpot. These bindings expose the
 * informational view surface (emission rate, pending emission, sink addresses); the hub's
 * fee-routing writes are keeper/protocol operations and are intentionally not included.
 */
export class SlvrHub {
  private publicClient: PublicClient;
  private address: Address;

  private static readonly ABI = parseAbi([
    // View functions
    'function pendingEmission(uint256 gameId) view returns (uint256)',
    'function emissionRatePerSec() view returns (uint256)',
    'function targetSupply() view returns (uint256)',
    'function maxAccrualSeconds() view returns (uint256)',
    'function staking() view returns (address)',
    'function jackpot() view returns (address)',
    'function stakerSeq() view returns (uint256)',
    'function pendingStakerRewards() view returns (uint256)',
  ]);

  constructor(publicClient: PublicClient, _walletClient: WalletClient | undefined, address: Address) {
    this.publicClient = publicClient;
    this.address = address;
  }

  // Read-only module; kept for a uniform module interface.
  setWalletClient(_walletClient: WalletClient | undefined): void {}

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  /**
   * Accrued-but-unminted SLVR emission currently available to a game (its bucket + streamed since
   * last accrual, hard-capped at one maxAccrualSeconds window of the game's effective rate).
   */
  async pendingEmission(gameId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'pendingEmission',
      args: [gameId],
    }) as bigint;
  }

  /**
   * Base SLVR/sec emission rate across the whole active game set
   */
  async emissionRatePerSec(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'emissionRatePerSec',
    }) as bigint;
  }

  /**
   * Soft-cap target supply (0 => use token MAX_SUPPLY)
   */
  async targetSupply(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'targetSupply',
    }) as bigint;
  }

  /**
   * Idle-forfeiture window: cap on dt per accrual (seconds)
   */
  async maxAccrualSeconds(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'maxAccrualSeconds',
    }) as bigint;
  }

  /**
   * Address of the shared veNFT staking contract
   */
  async staking(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'staking',
    }) as Address;
  }

  /**
   * Address of the shared jackpot contract
   */
  async jackpot(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'jackpot',
    }) as Address;
  }

  /**
   * Hub-owned sequential counter used to feed the staking contract's round numbering
   */
  async stakerSeq(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'stakerSeq',
    }) as bigint;
  }

  /**
   * Native staker rewards received but not yet flushed to the staking stream
   */
  async pendingStakerRewards(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrHub.ABI,
      functionName: 'pendingStakerRewards',
    }) as bigint;
  }
}
