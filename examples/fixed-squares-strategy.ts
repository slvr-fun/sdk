/**
 * Example: Fixed Squares Strategy
 * 
 * This strategy bets on a fixed set of squares every round
 * when the total wager is below the threshold.
 * 
 * Perfect for users who want to consistently bet on specific squares.
 */

import { BettingStrategy } from './strategy-base';
import { parseEther } from 'viem';
import { SlvrSDK } from '../src';

/**
 * Configuration for fixed squares strategy
 */
export interface FixedSquaresConfig {
  /** Squares to bet on (0-24) */
  squares: number[];
  /** Amount to bet per square (in wei) */
  amountPerSquare: bigint;
  /** Optional: different amount for each square (overrides amountPerSquare) */
  amounts?: bigint[];
  /** Threshold in wei - only bet when round total wager is below this */
  threshold?: bigint;
  /** How often to check rounds (in milliseconds) */
  checkInterval?: number;
}

/**
 * Strategy that bets on fixed squares every round
 */
export class FixedSquaresStrategy extends BettingStrategy {
  private squares: number[];
  private amountPerSquare: bigint;
  private amounts?: bigint[];

  constructor(sdk: SlvrSDK, config: FixedSquaresConfig) {
    super(sdk, {
      threshold: config.threshold,
      checkInterval: config.checkInterval,
    });

    // Validate squares
    if (!config.squares || config.squares.length === 0) {
      throw new Error('At least one square must be specified');
    }

    for (const square of config.squares) {
      if (square < 0 || square >= 25) {
        throw new Error(`Invalid square: ${square}. Must be 0-24`);
      }
    }

    // Check for duplicates
    const unique = new Set(config.squares);
    if (unique.size !== config.squares.length) {
      throw new Error('Duplicate squares not allowed');
    }

    this.squares = config.squares;
    this.amountPerSquare = config.amountPerSquare;
    this.amounts = config.amounts;

    // Validate amounts array if provided
    if (this.amounts) {
      if (this.amounts.length !== this.squares.length) {
        throw new Error('Amounts array length must match squares array length');
      }
      for (const amount of this.amounts) {
        if (amount <= 0n) {
          throw new Error('All amounts must be greater than 0');
        }
      }
    } else if (this.amountPerSquare <= 0n) {
      throw new Error('Amount per square must be greater than 0');
    }
  }

  /**
   * Always bet on the fixed squares
   */
  protected async selectSquares(): Promise<number[]> {
    return this.squares;
  }

  /**
   * Use configured amounts
   */
  protected async calculateAmounts(): Promise<bigint[]> {
    if (this.amounts) {
      return this.amounts;
    }
    return this.squares.map(() => this.amountPerSquare);
  }

  /**
   * Log configuration
   */
  protected logConfig(): void {
    super.logConfig();
    console.log(`   Squares: ${this.squares.join(', ')}`);
    const total = this.amounts
      ? this.amounts.reduce((sum, amt) => sum + amt, 0n)
      : this.amountPerSquare * BigInt(this.squares.length);
    console.log(`   Amount per square: ${SlvrSDK.formatToken(this.amountPerSquare)} ETH`);
    console.log(`   Total bet per round: ${SlvrSDK.formatToken(total)} ETH`);
  }
}

/**
 * Example usage
 */
export async function exampleFixedSquaresStrategy() {
  const { createPublicClient, createWalletClient, http } = await import('viem');
  const { defineChain } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');
  const { SlvrSDK } = await import('../src');
  const { CONTRACTS, ROBINHOOD_CHAIN } = await import('./constants');

  // Create clients
  const robinhood = defineChain(ROBINHOOD_CHAIN);
  const publicClient = createPublicClient({
    chain: robinhood,
    transport: http(),
  });

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    chain: robinhood,
    transport: http(),
    account,
  });

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

  // Create strategy: bet on squares 0, 5, 10, 15, 20 every round
  const strategy = new FixedSquaresStrategy(sdk, {
    squares: [0, 5, 10, 15, 20], // Bet on these 5 squares
    amountPerSquare: parseEther('1'), // 1 ETH per square
    threshold: parseEther('100'), // Only bet when round has < 100 ETH
    checkInterval: 5000, // Check every 5 seconds
  });

  // Start the strategy
  await strategy.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, stopping strategy...');
    strategy.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, stopping strategy...');
    strategy.stop();
    process.exit(0);
  });
}

