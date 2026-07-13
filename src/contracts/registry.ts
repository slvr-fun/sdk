import { Address, parseAbi, PublicClient, WalletClient } from 'viem';
import { GameInfo, GameStatus, GameTier } from '../types';

/**
 * SlvrGameRegistry contract interface (read-only surface).
 *
 * Single source of truth for which games exist, their status/tier, and their share of the shared
 * emission stream.
 */
export class SlvrGameRegistry {
  private publicClient: PublicClient;
  private address: Address;

  private static readonly ABI = parseAbi([
    'function gameIdOf(address game) view returns (uint256)',
    'function gameInfo(uint256 gameId) view returns ((address game, bytes32 gameType, uint8 status, uint8 tier, uint32 emissionWeight, uint16 maxWeightBps, bool exists))',
    'function isActive(address game) view returns (bool)',
    'function statusOf(uint256 gameId) view returns (uint8)',
    'function tierOf(uint256 gameId) view returns (uint8)',
    'function weightOf(uint256 gameId) view returns (uint32)',
    'function maxWeightBpsOf(uint256 gameId) view returns (uint16)',
    'function totalActiveWeight() view returns (uint256)',
    'function gameCount() view returns (uint256)',
  ]);

  constructor(publicClient: PublicClient, _walletClient: WalletClient | undefined, address: Address) {
    this.publicClient = publicClient;
    this.address = address;
  }

  /** Read-only contract: no wallet client needed. Kept for a consistent SDK surface. */
  setWalletClient(_walletClient: WalletClient | undefined): void {
    // no-op
  }

  /**
   * Registry id for a game address (0 if not registered; ids are 1-based)
   */
  async gameIdOf(game: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'gameIdOf',
      args: [game],
    }) as bigint;
  }

  /**
   * Full record for a game id
   */
  async gameInfo(gameId: bigint): Promise<GameInfo> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'gameInfo',
      args: [gameId],
    }) as {
      game: Address;
      gameType: `0x${string}`;
      status: number;
      tier: number;
      emissionWeight: number;
      maxWeightBps: number;
      exists: boolean;
    };

    return {
      game: result.game,
      gameType: result.gameType,
      status: result.status as GameStatus,
      tier: result.tier as GameTier,
      emissionWeight: Number(result.emissionWeight),
      maxWeightBps: Number(result.maxWeightBps),
      exists: result.exists,
    };
  }

  /**
   * Is this address a registered, Active game?
   */
  async isActive(game: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'isActive',
      args: [game],
    }) as boolean;
  }

  /**
   * Status enum for a game id
   */
  async statusOf(gameId: bigint): Promise<GameStatus> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'statusOf',
      args: [gameId],
    }) as number;
    return result as GameStatus;
  }

  /**
   * Tier enum for a game id
   */
  async tierOf(gameId: bigint): Promise<GameTier> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'tierOf',
      args: [gameId],
    }) as number;
    return result as GameTier;
  }

  /**
   * Emission weight (relative share of the global stream) for a game id
   */
  async weightOf(gameId: bigint): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'weightOf',
      args: [gameId],
    }) as number;
    return BigInt(result);
  }

  /**
   * Max realized-fraction ceiling (bps of 10000) for a game id
   */
  async maxWeightBpsOf(gameId: bigint): Promise<number> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'maxWeightBpsOf',
      args: [gameId],
    }) as number;
    return Number(result);
  }

  /**
   * Sum of emissionWeight across all Active games (denominator for the split)
   */
  async totalActiveWeight(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'totalActiveWeight',
    }) as bigint;
  }

  /**
   * Number of registered games
   */
  async gameCount(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGameRegistry.ABI,
      functionName: 'gameCount',
    }) as bigint;
  }
}
