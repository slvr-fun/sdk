import { Address, parseAbi, decodeEventLog, Log } from 'viem';

/**
 * Event ABIs for Slvr contracts
 */
export const SlvrGridLotteryEvents = parseAbi([
  'event BetPlaced(uint256 indexed roundId, address indexed beneficiary, uint256 total, uint8[] squares)',
  'event Claimed(uint256 indexed roundId, address indexed user, uint256 nativeOut, uint256 slvrOut, uint256 refinedOut, uint256 refiningFee)',
  'event RoundResolved(uint256 indexed roundId, uint8 winningSquare, bool jackpotHit, bool singleMinerRound, address indexed singleMinerWinner, uint256 winnerTotal, uint256 potForWinners, uint256 slvrForWinners, uint256 totalUnclaimedSlvr)',
  'event RandomnessRequested(uint256 indexed roundId, bytes32 randomnessId)',
]);

/**
 * Events for the veNFT staker (`SlvrVoteEscrowStaking`). All staking events are
 * keyed by the veNFT `tokenId`; there are no raw-ERC20-amount stake events.
 */
export const SlvrStakingEvents = parseAbi([
  'event Staked(uint256 indexed tokenId, address indexed user, uint256 weight)',
  'event Unstaked(uint256 indexed tokenId, address indexed user, uint256 weight)',
  'event RewardClaimed(uint256 indexed tokenId, address indexed user, uint256 amount)',
  'event RewardDistributed(uint256 amount)',
  'event Checkpoint(uint256 indexed tokenId, uint256 oldWeight, uint256 newWeight)',
  'event RewardsSettledOnBurn(uint256 indexed tokenId, address indexed owner, uint256 amount)',
  'event PendingRewardsClaimed(address indexed user, uint256 amount)',
]);

export const SlvrTokenEvents = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

export const SlvrAutoCommitEvents = parseAbi([
  'event PlanConfigured(address indexed user, uint256 nextRoundId, uint32 plays, uint256 amountPerPlay, bool autoClaim)',
  'event PlanDisabled(address indexed user)',
  'event PlanCancelled(address indexed user, uint256 refundAmount)',
  'event Deposited(address indexed user, uint256 amount)',
  'event Withdrawn(address indexed user, uint256 amount, address to)',
  'event RoundExecuted(address indexed user, uint256 indexed roundId, uint32 playsRemaining)',
  'event Claimed(address indexed user, uint256 indexed roundId, uint256 nativeAmount, uint256 addedToBalance)',
  'event BalanceUpdated(address indexed user, uint256 newBalance, uint256 amountAdded)',
  'event ExecutorFeePaid(address indexed user, address indexed executor, uint256 fee, uint256 gasUsed)',
]);

/**
 * Decode a log using the provided ABI
 * @param abi Contract ABI
 * @param log Log to decode
 * @returns Decoded event or null if decoding fails
 */
export function decodeEvent<T = unknown>(abi: readonly unknown[], log: Log): T | null {
  try {
    const decoded = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics,
    });
    return decoded as T;
  } catch {
    return null;
  }
}

/**
 * Filter and decode events from logs
 * @param abi Contract ABI
 * @param logs Array of logs
 * @param eventName Optional event name to filter by
 * @returns Array of decoded events
 */
export function decodeEvents<T = unknown>(
  abi: readonly unknown[],
  logs: Log[],
  eventName?: string
): T[] {
  const decoded: T[] = [];

  for (const log of logs) {
    try {
      const decodedEvent = decodeEvent<T>(abi, log);
      if (decodedEvent) {
        if (!eventName || (decodedEvent as { eventName?: string }).eventName === eventName) {
          decoded.push(decodedEvent);
        }
      }
    } catch {
      // Skip invalid logs
    }
  }

  return decoded;
}

/**
 * BetPlaced event data
 */
export interface BetPlacedEvent {
  eventName: 'BetPlaced';
  args: {
    roundId: bigint;
    beneficiary: Address;
    total: bigint;
    squares: readonly number[];
  };
}

/**
 * Claimed event data
 */
export interface ClaimedEvent {
  eventName: 'Claimed';
  args: {
    roundId: bigint;
    user: Address;
    nativeOut: bigint;
    slvrOut: bigint;
    refinedOut: bigint;
    refiningFee: bigint;
  };
}

/**
 * Round resolved event data
 */
export interface RoundResolvedEvent {
  eventName: 'RoundResolved';
  args: {
    roundId: bigint;
    winningSquare: number;
    jackpotHit: boolean;
    singleMinerRound: boolean;
    singleMinerWinner: Address;
    winnerTotal: bigint;
    potForWinners: bigint;
    slvrForWinners: bigint;
    totalUnclaimedSlvr: bigint;
  };
}

/**
 * RandomnessRequested event data
 */
export interface RandomnessRequestedEvent {
  eventName: 'RandomnessRequested';
  args: {
    roundId: bigint;
    randomnessId: `0x${string}`;
  };
}
