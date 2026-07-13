/**
 * Example: How to create custom strategies
 * 
 * This file shows how easy it is to create custom betting strategies
 * by extending the BettingStrategy base class.
 */

import { BettingStrategy } from './strategy-base';
import { parseEther } from 'viem';
import { SlvrSDK } from '../src';

/**
 * Example 1: Bet on squares with least allocation
 */
export class LeastAllocatedCustomStrategy extends BettingStrategy {
  private squareCount: number;
  private totalBetAmount: bigint;

  constructor(sdk: SlvrSDK, config: { squareCount?: number; totalBetAmount?: bigint; threshold?: bigint }) {
    super(sdk, { threshold: config.threshold });
    this.squareCount = config.squareCount ?? 5;
    this.totalBetAmount = config.totalBetAmount ?? parseEther('5');
  }

  protected async selectSquares(roundId: bigint): Promise<number[]> {
    // Get all squares with their allocations
    const squares = await this.sdk.lottery.getRoundSquares(roundId);
    
    // Sort by total (ascending) - least allocated first
    const sorted = squares
      .map(({ square, total }) => ({ square, total }))
      .sort((a, b) => {
        if (a.total < b.total) return -1;
        if (a.total > b.total) return 1;
        return 0;
      });

    // Return the N least allocated squares
    return sorted.slice(0, this.squareCount).map(({ square }) => square);
  }

  protected async calculateAmounts(roundId: bigint, round: any, squares: number[]): Promise<bigint[]> {
    // Distribute total bet amount evenly
    const amountPerSquare = this.totalBetAmount / BigInt(squares.length);
    const remainder = this.totalBetAmount % BigInt(squares.length);
    
    const amounts = squares.map(() => amountPerSquare);
    if (remainder > 0n) {
      amounts[0] += remainder; // Add remainder to first square
    }
    
    return amounts;
  }
}

/**
 * Example 2: Bet on random squares
 */
export class RandomSquaresStrategy extends BettingStrategy {
  private squareCount: number;
  private amountPerSquare: bigint;

  constructor(sdk: SlvrSDK, config: { squareCount?: number; amountPerSquare?: bigint; threshold?: bigint }) {
    super(sdk, { threshold: config.threshold });
    this.squareCount = config.squareCount ?? 5;
    this.amountPerSquare = config.amountPerSquare ?? parseEther('1');
  }

  protected async selectSquares(): Promise<number[]> {
    // Generate random squares
    const allSquares = Array.from({ length: 25 }, (_, i) => i);
    const shuffled = [...allSquares].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, this.squareCount);
  }

  protected async calculateAmounts(roundId: bigint, round: any, squares: number[]): Promise<bigint[]> {
    return squares.map(() => this.amountPerSquare);
  }
}

/**
 * Example 3: Bet on squares with most bettors (social proof strategy)
 */
export class MostBettorsStrategy extends BettingStrategy {
  private squareCount: number;
  private amountPerSquare: bigint;

  constructor(sdk: SlvrSDK, config: { squareCount?: number; amountPerSquare?: bigint; threshold?: bigint }) {
    super(sdk, { threshold: config.threshold });
    this.squareCount = config.squareCount ?? 5;
    this.amountPerSquare = config.amountPerSquare ?? parseEther('1');
  }

  protected async selectSquares(roundId: bigint): Promise<number[]> {
    const squares = await this.sdk.lottery.getRoundSquares(roundId);
    
    // Sort by number of bettors (descending)
    const sorted = squares
      .map(({ square, bettors }) => ({ square, bettors }))
      .sort((a, b) => {
        if (a.bettors > b.bettors) return -1;
        if (a.bettors < b.bettors) return 1;
        return 0;
      });

    return sorted.slice(0, this.squareCount).map(({ square }) => square);
  }

  protected async calculateAmounts(roundId: bigint, round: any, squares: number[]): Promise<bigint[]> {
    return squares.map(() => this.amountPerSquare);
  }
}

/**
 * Example 4: Weighted strategy - bet more on squares with less allocation
 */
export class WeightedAllocationStrategy extends BettingStrategy {
  private squareCount: number;
  private totalBetAmount: bigint;

  constructor(sdk: SlvrSDK, config: { squareCount?: number; totalBetAmount?: bigint; threshold?: bigint }) {
    super(sdk, { threshold: config.threshold });
    this.squareCount = config.squareCount ?? 5;
    this.totalBetAmount = config.totalBetAmount ?? parseEther('10');
  }

  protected async selectSquares(roundId: bigint): Promise<number[]> {
    const squares = await this.sdk.lottery.getRoundSquares(roundId);
    const sorted = squares
      .map(({ square, total }) => ({ square, total }))
      .sort((a, b) => {
        if (a.total < b.total) return -1;
        if (a.total > b.total) return 1;
        return 0;
      });

    return sorted.slice(0, this.squareCount).map(({ square }) => square);
  }

  protected async calculateAmounts(roundId: bigint, round: any, squares: number[]): Promise<bigint[]> {
    // Get allocations for selected squares
    const squaresData = await this.sdk.lottery.getRoundSquares(roundId);
    const selectedData = squaresData.filter(sq => squares.includes(sq.square));
    
    // Calculate total allocation for selected squares
    const totalAllocation = selectedData.reduce((sum, sq) => sum + sq.total, 0n);
    
    if (totalAllocation === 0n) {
      // If no allocation, distribute evenly
      const amountPerSquare = this.totalBetAmount / BigInt(squares.length);
      const remainder = this.totalBetAmount % BigInt(squares.length);
      const amounts = squares.map(() => amountPerSquare);
      if (remainder > 0n) amounts[0] += remainder;
      return amounts;
    }

    // Weight inversely by allocation (less allocation = more bet)
    // Calculate weights: weight = 1 / (allocation + 1) to avoid division by zero
    const weights = selectedData.map(sq => {
      const allocation = sq.total;
      // Use inverse weight: lower allocation gets higher weight
      // Add 1 to avoid division issues
      return Number(1000000n / (allocation + 1n)); // Scale up for precision
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    // Distribute bet amount proportionally to weights
    const amounts = weights.map(weight => {
      return (this.totalBetAmount * BigInt(Math.round(weight))) / BigInt(totalWeight);
    });

    // Adjust for rounding
    const total = amounts.reduce((sum, amt) => sum + amt, 0n);
    const diff = this.totalBetAmount - total;
    if (diff !== 0n) {
      amounts[0] += diff;
    }

    return amounts;
  }
}

/**
 * Example 5: Conditional strategy - only bet on certain conditions
 */
export class ConditionalStrategy extends BettingStrategy {
  private squares: number[];
  private amountPerSquare: bigint;
  private minBettors: number; // Only bet if squares have at least this many bettors

  constructor(
    sdk: SlvrSDK,
    config: {
      squares: number[];
      amountPerSquare: bigint;
      minBettors?: number;
      threshold?: bigint;
    }
  ) {
    super(sdk, { threshold: config.threshold });
    this.squares = config.squares;
    this.amountPerSquare = config.amountPerSquare;
    this.minBettors = config.minBettors ?? 0;
  }

  protected async shouldBet(roundId: bigint, round: any): Promise<{ shouldBet: boolean; reason?: string }> {
    // Check if squares have enough bettors
    const squaresData = await this.sdk.lottery.getRoundSquares(roundId);
    const selectedData = squaresData.filter(sq => this.squares.includes(sq.square));
    
    const minBettors = Math.min(...selectedData.map(sq => Number(sq.bettors)));
    if (minBettors < this.minBettors) {
      return {
        shouldBet: false,
        reason: `Squares don't have enough bettors (min: ${this.minBettors}, found: ${minBettors})`,
      };
    }

    return { shouldBet: true };
  }

  protected async selectSquares(): Promise<number[]> {
    return this.squares;
  }

  protected async calculateAmounts(roundId: bigint, round: any, squares: number[]): Promise<bigint[]> {
    return squares.map(() => this.amountPerSquare);
  }
}

