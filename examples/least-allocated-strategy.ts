/**
 * Example: Betting strategy that targets squares with least allocation
 * 
 * This example shows how to:
 * 1. Get all squares and their current allocations
 * 2. Identify squares with the least funds
 * 3. Distribute bets across these squares
 */

import { SlvrSDK } from '../src';
import { parseEther } from 'viem';

/**
 * Strategy that bets on squares with the least allocation
 */
export class LeastAllocatedStrategy {
  private sdk: SlvrSDK;

  constructor(sdk: SlvrSDK) {
    this.sdk = sdk;
  }

  /**
   * Get squares sorted by allocation (least to most)
   */
  async getSquaresByAllocation(roundId: bigint): Promise<
    Array<{ square: number; total: bigint; bettors: bigint; percentage: number }>
  > {
    const squares = await this.sdk.lottery.getRoundSquares(roundId);
    
    // Calculate total across all squares
    const totalAllocation = squares.reduce((sum, sq) => sum + sq.total, 0n);
    
    // Add percentage and sort by total (ascending)
    const withPercentage = squares
      .map(({ square, total, bettors }) => ({
        square,
        total,
        bettors,
        percentage: totalAllocation > 0n 
          ? Number((total * 10000n) / totalAllocation) / 100 
          : 0,
      }))
      .sort((a, b) => {
        if (a.total < b.total) return -1;
        if (a.total > b.total) return 1;
        return 0;
      });

    return withPercentage;
  }

  /**
   * Get the N squares with least allocation
   */
  async getLeastAllocatedSquares(
    roundId: bigint,
    count: number = 5
  ): Promise<number[]> {
    const sorted = await this.getSquaresByAllocation(roundId);
    return sorted.slice(0, count).map(({ square }) => square);
  }

  /**
   * Calculate bet amounts for least allocated squares
   * Distributes total bet amount evenly across selected squares
   */
  calculateBetAmounts(
    totalAmount: bigint,
    squareCount: number
  ): bigint[] {
    const amountPerSquare = totalAmount / BigInt(squareCount);
    const remainder = totalAmount % BigInt(squareCount);
    
    const amounts = Array(squareCount).fill(amountPerSquare);
    
    // Add remainder to first square to ensure exact total
    if (remainder > 0n) {
      amounts[0] += remainder;
    }
    
    return amounts;
  }

  /**
   * Place a bet on least allocated squares
   */
  async betOnLeastAllocated(
    roundId: bigint,
    totalBetAmount: bigint,
    squareCount: number = 5
  ): Promise<`0x${string}`> {
    if (!this.sdk.getWalletClient()) {
      throw new Error('Wallet client required for betting');
    }

    // Get squares with least allocation
    const squares = await this.getLeastAllocatedSquares(roundId, squareCount);
    
    if (squares.length === 0) {
      throw new Error('No squares available');
    }

    // Calculate amounts
    const amounts = this.calculateBetAmounts(totalBetAmount, squares.length);

    console.log(`🎯 Betting on ${squares.length} least allocated squares:`);
    squares.forEach((square, i) => {
      console.log(`  Square ${square}: ${SlvrSDK.formatToken(amounts[i])} ETH`);
    });
    console.log(`💰 Total: ${SlvrSDK.formatToken(totalBetAmount)} ETH`);

    // Place the bet
    return await this.sdk.lottery.bet({
      roundId,
      squares,
      amounts,
    });
  }

  /**
   * Get detailed analysis of square allocations
   */
  async analyzeRound(roundId: bigint): Promise<{
    roundId: bigint;
    totalAllocation: bigint;
    squares: Array<{
      square: number;
      total: bigint;
      bettors: bigint;
      percentage: number;
      rank: number;
    }>;
    leastAllocated: number[];
    mostAllocated: number[];
  }> {
    const sorted = await this.getSquaresByAllocation(roundId);
    const totalAllocation = sorted.reduce((sum, sq) => sum + sq.total, 0n);

    return {
      roundId,
      totalAllocation,
      squares: sorted.map((sq, index) => ({
        ...sq,
        rank: index + 1,
      })),
      leastAllocated: sorted.slice(0, 5).map(({ square }) => square),
      mostAllocated: sorted.slice(-5).reverse().map(({ square }) => square),
    };
  }
}

/**
 * Example usage
 * 
 * Set PRIVATE_KEY environment variable to enable betting
 */
export async function exampleLeastAllocatedStrategy() {
  const { createPublicClient, createWalletClient, http } = await import('viem');
  const { defineChain } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { parseEther } = await import('viem');
  const { SlvrSDK } = await import('../src');
  const { CONTRACTS, ROBINHOOD_CHAIN } = await import('./constants');

  // Create clients
  const robinhood = defineChain(ROBINHOOD_CHAIN);
  const publicClient = createPublicClient({
    chain: robinhood,
    transport: http(),
  });

  const privateKey = process.env.PRIVATE_KEY;
  let walletClient: ReturnType<typeof createWalletClient> | undefined;
  
  if (privateKey) {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    walletClient = createWalletClient({
      chain: robinhood,
      transport: http(),
      account,
    });
  }

  // Initialize SDK
  const sdk = new SlvrSDK({
    publicClient,
    walletClient,
    addresses: {
      lottery: CONTRACTS.LOTTERY,
      staking: CONTRACTS.STAKING,
      token: CONTRACTS.TOKEN,
      autoCommit: CONTRACTS.AUTO_COMMIT !== '0x...' ? CONTRACTS.AUTO_COMMIT : undefined,
    },
  });

  const strategy = new LeastAllocatedStrategy(sdk);
  const roundId = await sdk.lottery.currentRoundId();

  // Analyze the round
  const analysis = await strategy.analyzeRound(roundId);
  console.log('Round Analysis:', {
    totalAllocation: SlvrSDK.formatToken(analysis.totalAllocation),
    leastAllocated: analysis.leastAllocated,
    mostAllocated: analysis.mostAllocated,
  });

  // Get squares with least allocation
  const leastAllocated = await strategy.getLeastAllocatedSquares(roundId, 5);
  console.log('Least allocated squares:', leastAllocated);

  // Place bet on these squares (if wallet client is available)
  if (walletClient) {
    const txHash = await strategy.betOnLeastAllocated(
      roundId,
      parseEther('5'), // 5 ETH total
      5 // Bet on 5 squares
    );
    console.log('Bet placed:', txHash);
  } else {
    console.log('Cannot place bet - set PRIVATE_KEY environment variable');
  }
}

