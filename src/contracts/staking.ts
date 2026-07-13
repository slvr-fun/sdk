import { Address, parseAbi, PublicClient, WalletClient } from 'viem';
import { StakingInfo } from '../types';
import { WalletClientRequiredError, ContractCallError } from '../errors';

/**
 * SlvrVoteEscrowStaking contract interface.
 *
 * This is a veNFT-based staker: stakers deposit a vote-escrow NFT (by tokenId) rather than a raw
 * ERC20 amount. Rewards accrue per unit of the token's tracked weight and are claimed per tokenId.
 */
export class SlvrStaking {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private address: Address;

  private static readonly ABI = parseAbi([
    // View functions
    'function getStakerRewards(uint256 tokenId) view returns (uint256)',
    'function getTotalWeight() view returns (uint256)',
    'function rewardPerWeightStored() view returns (uint256)',
    'function rewardPerWeightPaid(uint256 tokenId) view returns (uint256)',
    'function balance(uint256 tokenId) view returns (uint256)',
    'function rewards(uint256 tokenId) view returns (uint256)',
    'function totalWeight() view returns (uint256)',
    'function unallocated() view returns (uint256)',
    'function lastDistributedRoundId() view returns (uint256)',
    'function LOTTERY() view returns (address)',

    // Write functions
    'function stake(uint256 tokenId)',
    'function unstake(uint256 tokenId)',
    'function claimStakerRewards(uint256 tokenId)',
    'function checkpoint(uint256 tokenId)',
    'function poke(uint256 tokenId)',
    'function pokeMany(uint256[] tokenIds)',
  ]);

  constructor(publicClient: PublicClient, walletClient: WalletClient | undefined, address: Address) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
  }

  /**
   * Update the wallet client
   * @param walletClient New wallet client
   */
  setWalletClient(walletClient: WalletClient | undefined): void {
    this.walletClient = walletClient;
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  /**
   * Get claimable rewards for a staked veNFT tokenId
   */
  async getStakerRewards(tokenId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'getStakerRewards',
      args: [tokenId],
    }) as bigint;
  }

  /**
   * Get the total tracked weight across all staked tokens
   */
  async getTotalWeight(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'getTotalWeight',
    }) as bigint;
  }

  /**
   * Get the accumulated reward per unit of weight (1e18 precision)
   */
  async rewardPerWeightStored(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'rewardPerWeightStored',
    }) as bigint;
  }

  /**
   * Get the last rewardPerWeightStored snapshot recorded for a tokenId
   */
  async rewardPerWeightPaid(tokenId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'rewardPerWeightPaid',
      args: [tokenId],
    }) as bigint;
  }

  /**
   * Get the tracked weight (balance) for a staked tokenId
   */
  async balance(tokenId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'balance',
      args: [tokenId],
    }) as bigint;
  }

  /**
   * Get the accrued (checkpointed) claimable rewards stored for a tokenId
   */
  async rewards(tokenId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'rewards',
      args: [tokenId],
    }) as bigint;
  }

  /**
   * Get the total tracked weight (public storage var)
   */
  async totalWeight(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'totalWeight',
    }) as bigint;
  }

  /**
   * Get unallocated rewards (distributed while no weight was staked)
   */
  async unallocated(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'unallocated',
    }) as bigint;
  }

  /**
   * Get the last distributed round ID (type(uint256).max sentinel when none)
   */
  async lastDistributedRoundId(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'lastDistributedRoundId',
    }) as bigint;
  }

  /**
   * Get the lottery address authorized to distribute rewards
   */
  async lottery(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'LOTTERY',
    }) as Address;
  }

  /**
   * Get complete staking info for a staked veNFT tokenId
   */
  async getStakingInfo(tokenId: bigint): Promise<StakingInfo> {
    const [totalWeight_, balance_, rewards_, rewardPerWeightStored_] = await Promise.all([
      this.totalWeight(),
      this.balance(tokenId),
      this.getStakerRewards(tokenId),
      this.rewardPerWeightStored(),
    ]);

    return {
      totalWeight: totalWeight_,
      balance: balance_,
      rewards: rewards_,
      rewardPerWeightStored: rewardPerWeightStored_,
    };
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Stake a vote-escrow NFT by tokenId
   * @param tokenId The veNFT token ID to stake
   * @returns Transaction hash
   */
  async stake(tokenId: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('staking');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrStaking.ABI,
        functionName: 'stake',
        args: [tokenId],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to stake: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Unstake a vote-escrow NFT by tokenId
   * @param tokenId The veNFT token ID to unstake
   * @returns Transaction hash
   */
  async unstake(tokenId: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('unstaking');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrStaking.ABI,
        functionName: 'unstake',
        args: [tokenId],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to unstake: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Claim staker rewards for a tokenId
   * @param tokenId The veNFT token ID to claim rewards for
   * @returns Transaction hash
   */
  async claimStakerRewards(tokenId: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('claiming rewards');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrStaking.ABI,
        functionName: 'claimStakerRewards',
        args: [tokenId],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to claim rewards: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Checkpoint a token's reward accounting
   * @param tokenId The veNFT token ID to checkpoint
   * @returns Transaction hash
   */
  async checkpoint(tokenId: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('checkpointing');
    }
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'checkpoint',
      args: [tokenId],
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Poke a token to refresh its tracked weight
   * @param tokenId The veNFT token ID to poke
   * @returns Transaction hash
   */
  async poke(tokenId: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('poking');
    }
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'poke',
      args: [tokenId],
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Poke many tokens to refresh their tracked weight in one call
   * @param tokenIds The veNFT token IDs to poke
   * @returns Transaction hash
   */
  async pokeMany(tokenIds: bigint[]): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('poking');
    }
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrStaking.ABI,
      functionName: 'pokeMany',
      args: [tokenIds],
      account: this.walletClient.account!,
      chain: null,
    });
  }
}
