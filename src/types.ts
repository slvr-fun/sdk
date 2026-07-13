import { Address, PublicClient, WalletClient } from 'viem';

/**
 * Configuration for the Slvr SDK
 */
export interface SlvrConfig {
  /** Public client for read operations */
  publicClient: PublicClient;
  /** Wallet client for write operations (optional, required for transactions) */
  walletClient?: WalletClient;
  /** Contract addresses */
  addresses: {
    lottery: Address;
    staking: Address;
    token: Address;
    autoCommit?: Address;
    /** SlvrHub address (optional, for emission/staker/jackpot stats and keeper/admin ops) */
    hub?: Address;
    /** SlvrGameRegistry address (optional, for game weight/status stats) */
    registry?: Address;
    /** SlvrJackpot address (optional, for jackpot pool reads) */
    jackpot?: Address;
    /** SLVR/ETH UniswapV2 pair address (optional, enables `sdk.price` SLVR price reads) */
    slvrEthPair?: Address;
    /**
     * Chainlink-style ETH/USD price feed address (optional, enables `sdk.ethUsd`
     * and USD-denominated prices). Only set on chains that actually have a feed.
     */
    chainlinkEthUsd?: Address;
  };
}

/**
 * A SLVR price quote in both ETH and USD.
 */
export interface PriceQuote {
  /** Price in ETH (ETH per SLVR). */
  eth: number;
  /** Price in USD, or `null` if no ETH/USD source was available. */
  usd: number | null;
}

/**
 * Round information
 */
export interface RoundInfo {
  roundId: bigint;
  requestedAt: bigint;
  resolved: boolean;
  randomnessId: `0x${string}`;
  randomnessValue: bigint;
  winningSquare: number;
  jackpotHit: boolean;
  singleMinerRound: boolean;
  singleMinerWinner: Address;
  totalWager: bigint;
  fee: bigint;
  winnerTotal: bigint;
  potForWinners: bigint;
  slvrForWinners: bigint;
  payoutMulWad: bigint;
  slvrMulWad: bigint;
  totalUnclaimedSlvr: bigint;
}

/**
 * Miner state information
 */
export interface MinerState {
  rewardsSlvr: bigint;
  refinedAccrued: bigint;
  indexSnapshot: bigint;
  hasAccount: boolean;
}

/**
 * Treasury state information
 */
export interface TreasuryState {
  minerIndex: bigint;
  totalUnclaimed: bigint;
  totalRefined: bigint;
  jackpotPool: bigint;
}

/**
 * Staking information for a staked veNFT tokenId
 */
export interface StakingInfo {
  /** Total tracked weight across all staked tokens */
  totalWeight: bigint;
  /** Tracked weight (balance) of this tokenId */
  balance: bigint;
  /** Claimable rewards for this tokenId */
  rewards: bigint;
  /** Accumulated reward per unit of weight (1e18 precision) */
  rewardPerWeightStored: bigint;
}

/**
 * AutoCommit plan information
 */
export interface AutoCommitPlan {
  enabled: boolean;
  nextRoundId: bigint;
  playsRemaining: number;
  amountPerPlay: bigint;
  balance: bigint;
  autoClaim: boolean;
  squares: number[];
  bpsAlloc: number[];
  planStartRoundId: bigint;
}

/**
 * Game status in the registry (mirrors ISlvrGameRegistry.Status)
 */
export enum GameStatus {
  Pending = 0,
  Active = 1,
  Paused = 2,
  Retired = 3,
}

/**
 * Game tier in the registry (mirrors ISlvrGameRegistry.Tier)
 */
export enum GameTier {
  Core = 0,
  Community = 1,
  Experimental = 2,
}

/**
 * Full registry record for a game (mirrors ISlvrGameRegistry.GameInfo)
 */
export interface GameInfo {
  game: Address;
  gameType: `0x${string}`;
  status: GameStatus;
  tier: GameTier;
  emissionWeight: number;
  maxWeightBps: number;
  exists: boolean;
}

/**
 * Optional transaction overrides passed through to viem's `writeContract`
 * (e.g. to manage gas or nonce in a high-throughput bot).
 */
export interface TxOverrides {
  gas?: bigint;
  nonce?: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

/**
 * Bet parameters
 */
export interface BetParams {
  roundId: bigint;
  squares: number[];
  amounts: bigint[];
  beneficiary?: Address;
  /** Optional gas/nonce overrides for the transaction. */
  overrides?: TxOverrides;
}

/**
 * Claim parameters
 */
export interface ClaimParams {
  roundId: bigint;
  /** Optional gas/nonce overrides for the transaction. */
  overrides?: TxOverrides;
}

/**
 * Advanced claim parameters (unified claim function)
 */
export interface ClaimParamsAdvanced {
  user: Address;           // User to claim for (must be msg.sender or delegate)
  roundId: bigint;        // Round to claim from
  recipientNative?: Address; // Address to receive native (0 = user)
  recipientSlvr?: Address;  // Address to receive SLVR (0 = user, or same as recipientNative)
  bypassFee?: boolean;     // Skip refining fee (only if recipientSlvr is authorized permanent lock)
  ethOnly?: boolean;       // If true, only claim ETH, leave SLVR unrefined in state
}

