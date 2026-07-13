/**
 * Example: Automated betting strategy
 * 
 * This example demonstrates how to:
 * 1. Monitor rounds and automatically bet when total wager is less than 100 ETH
 * 2. Bet on squares with the least funds allocated
 */

import { SlvrSDK } from '../src';
import { PublicClient, WalletClient, parseEther } from 'viem';

/**
 * Automated betting bot that bets when round has less than threshold ETH
 * and distributes bets across squares with least allocation
 */
export class AutomatedBettingBot {
  private sdk: SlvrSDK;
  private threshold: bigint; // Minimum total wager threshold (e.g., 100 ETH)
  private betAmount: bigint; // Amount to bet per square
  private minSquares: number; // Minimum number of squares to bet on
  private maxSquares: number; // Maximum number of squares to bet on
  private checkInterval: number; // How often to check (in milliseconds)
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    sdk: SlvrSDK,
    options: {
      threshold?: bigint; // Default: 100 ETH
      betAmount?: bigint; // Default: 1 ETH per square
      minSquares?: number; // Default: 3
      maxSquares?: number; // Default: 5
      checkInterval?: number; // Default: 5000ms (5 seconds)
    } = {}
  ) {
    this.sdk = sdk;
    this.threshold = options.threshold ?? parseEther('100');
    this.betAmount = options.betAmount ?? parseEther('1');
    this.minSquares = options.minSquares ?? 3;
    this.maxSquares = options.maxSquares ?? 5;
    this.checkInterval = options.checkInterval ?? 5000;
  }

  /**
   * Start the automated betting bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Bot is already running');
      return;
    }

    if (!this.sdk.getWalletClient()) {
      throw new Error('Wallet client required for automated betting');
    }

    this.isRunning = true;
    console.log('🤖 Automated betting bot started');
    console.log(`Threshold: ${SlvrSDK.formatToken(this.threshold)} ETH`);
    console.log(`Bet amount per square: ${SlvrSDK.formatToken(this.betAmount)} ETH`);
    console.log(`Checking every ${this.checkInterval / 1000} seconds`);

    // Check immediately
    await this.checkAndBet();

    // Then check at intervals
    this.intervalId = setInterval(async () => {
      await this.checkAndBet();
    }, this.checkInterval);
  }

  /**
   * Stop the automated betting bot
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('🛑 Automated betting bot stopped');
  }

  /**
   * Check current round and place bet if conditions are met
   */
  private async checkAndBet(): Promise<void> {
    try {
      const roundId = await this.sdk.lottery.currentRoundId();
      const round = await this.sdk.lottery.getRound(roundId);
      const isOpen = await this.sdk.lottery.roundOpen(roundId);

      if (!isOpen) {
        console.log(`⏸️  Round ${roundId} is not open for betting`);
        return;
      }

      // Check if total wager is below threshold
      if (round.totalWager >= this.threshold) {
        console.log(
          `💰 Round ${roundId} has ${SlvrSDK.formatToken(round.totalWager)} ETH ` +
          `(above threshold of ${SlvrSDK.formatToken(this.threshold)} ETH)`
        );
        return;
      }

      console.log(
        `🎯 Round ${roundId} has ${SlvrSDK.formatToken(round.totalWager)} ETH ` +
        `(below threshold of ${SlvrSDK.formatToken(this.threshold)} ETH)`
      );

      // Get squares with least allocation
      const squares = await this.getLeastAllocatedSquares();
      
      if (squares.length < this.minSquares) {
        console.log(`⚠️  Not enough squares with low allocation (found ${squares.length}, need ${this.minSquares})`);
        return;
      }

      // Limit to maxSquares
      const squaresToBet = squares.slice(0, this.maxSquares);
      const amounts = squaresToBet.map(() => this.betAmount);

      console.log(`📊 Betting on squares: ${squaresToBet.join(', ')}`);
      console.log(`💵 Total bet: ${SlvrSDK.formatToken(amounts.reduce((sum, amt) => sum + amt, 0n))} ETH`);

      // Place the bet
      const txHash = await this.sdk.lottery.bet({
        roundId,
        squares: squaresToBet,
        amounts,
      });

      console.log(`✅ Bet placed! Transaction: ${txHash}`);
    } catch (error) {
      console.error('❌ Error in automated betting:', error);
    }
  }

  /**
   * Get squares with the least funds allocated, sorted by total amount
   */
  private async getLeastAllocatedSquares(): Promise<number[]> {
    const roundId = await this.sdk.lottery.currentRoundId();
    const squares = await this.sdk.lottery.getRoundSquares(roundId);

    // Sort by total amount (ascending) - least allocated first
    const sorted = squares
      .map(({ square, total }) => ({ square, total }))
      .sort((a, b) => {
        if (a.total < b.total) return -1;
        if (a.total > b.total) return 1;
        return 0;
      });

    return sorted.map(({ square }) => square);
  }
}

/**
 * Example usage
 * 
 * Set PRIVATE_KEY environment variable to enable betting
 */
export async function exampleAutomatedBetting() {
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

  // Create bot with custom options
  const bot = new AutomatedBettingBot(sdk, {
    threshold: parseEther('100'), // Bet when round has less than 100 ETH
    betAmount: parseEther('1'), // Bet 1 ETH per square
    minSquares: 3, // Bet on at least 3 squares
    maxSquares: 5, // Bet on at most 5 squares
    checkInterval: 5000, // Check every 5 seconds
  });

  // Start the bot
  await bot.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, stopping bot...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, stopping bot...');
    bot.stop();
    process.exit(0);
  });
}

