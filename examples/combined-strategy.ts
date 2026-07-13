/**
 * Example: Combined strategy that bets when round has less than 100 ETH
 * and targets squares with least allocation
 * 
 * This combines both strategies into a single automated bot
 */

import { SlvrSDK } from '../src';
import { PublicClient, WalletClient, parseEther } from 'viem';
import { LeastAllocatedStrategy } from './least-allocated-strategy';

/**
 * Combined automated betting bot
 * - Monitors rounds for low total wager (< 100 ETH)
 * - Bets on squares with least allocation when conditions are met
 */
export class CombinedBettingBot {
  private sdk: SlvrSDK;
  private strategy: LeastAllocatedStrategy;
  private threshold: bigint;
  private betAmount: bigint;
  private squareCount: number;
  private checkInterval: number;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    sdk: SlvrSDK,
    options: {
      threshold?: bigint; // Default: 100 ETH
      betAmount?: bigint; // Default: 5 ETH total
      squareCount?: number; // Default: 5 squares
      checkInterval?: number; // Default: 5000ms
    } = {}
  ) {
    this.sdk = sdk;
    this.strategy = new LeastAllocatedStrategy(sdk);
    this.threshold = options.threshold ?? parseEther('100');
    this.betAmount = options.betAmount ?? parseEther('5');
    this.squareCount = options.squareCount ?? 5;
    this.checkInterval = options.checkInterval ?? 5000;
  }

  /**
   * Start monitoring and betting
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
    console.log('🚀 Combined betting bot started');
    console.log(`📊 Strategy: Bet when round < ${SlvrSDK.formatToken(this.threshold)} ETH`);
    console.log(`🎯 Target: ${this.squareCount} least allocated squares`);
    console.log(`💵 Bet amount: ${SlvrSDK.formatToken(this.betAmount)} ETH`);
    console.log(`⏱️  Checking every ${this.checkInterval / 1000} seconds\n`);

    // Check immediately
    await this.checkAndBet();

    // Then check at intervals
    this.intervalId = setInterval(async () => {
      await this.checkAndBet();
    }, this.checkInterval);
  }

  /**
   * Stop the bot
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
    console.log('\n🛑 Combined betting bot stopped');
  }

  /**
   * Check round and place bet if conditions are met
   */
  private async checkAndBet(): Promise<void> {
    try {
      const roundId = await this.sdk.lottery.currentRoundId();
      const round = await this.sdk.lottery.getRound(roundId);
      const isOpen = await this.sdk.lottery.roundOpen(roundId);

      // Check if round is open
      if (!isOpen) {
        const timeRemaining = await this.sdk.getTimeRemaining(roundId);
        if (timeRemaining > 0) {
          console.log(`⏸️  Round ${roundId} not open yet (${timeRemaining}s remaining)`);
        } else {
          console.log(`✅ Round ${roundId} has ended`);
        }
        return;
      }

      // Check if total wager is below threshold
      if (round.totalWager >= this.threshold) {
        const remaining = this.threshold - round.totalWager;
        console.log(
          `💰 Round ${roundId}: ${SlvrSDK.formatToken(round.totalWager)} ETH ` +
          `(need ${SlvrSDK.formatToken(remaining < 0n ? 0n : remaining)} more to reach threshold)`
        );
        return;
      }

      console.log(`\n🎯 Round ${roundId} conditions met!`);
      console.log(`   Total wager: ${SlvrSDK.formatToken(round.totalWager)} ETH`);
      console.log(`   Threshold: ${SlvrSDK.formatToken(this.threshold)} ETH`);

      // Get analysis of least allocated squares
      const analysis = await this.strategy.analyzeRound(roundId);
      console.log(`   Total allocation: ${SlvrSDK.formatToken(analysis.totalAllocation)} ETH`);
      console.log(`   Least allocated squares: ${analysis.leastAllocated.join(', ')}`);

      // Place bet on least allocated squares
      const squares = analysis.leastAllocated.slice(0, this.squareCount);
      const amounts = this.strategy.calculateBetAmounts(this.betAmount, squares.length);

      console.log(`\n📊 Placing bet:`);
      squares.forEach((square, i) => {
        const squareData = analysis.squares.find(sq => sq.square === square);
        console.log(
          `   Square ${square}: ${SlvrSDK.formatToken(amounts[i])} ETH ` +
          `(current: ${SlvrSDK.formatToken(squareData?.total || 0n)} ETH, ` +
          `${squareData?.percentage.toFixed(2)}%)`
        );
      });
      console.log(`   Total bet: ${SlvrSDK.formatToken(this.betAmount)} ETH`);

      const txHash = await this.sdk.lottery.bet({
        roundId,
        squares,
        amounts,
      });

      console.log(`\n✅ Bet placed successfully!`);
      console.log(`   Transaction: ${txHash}\n`);
    } catch (error) {
      console.error('❌ Error in combined betting bot:', error);
      if (error instanceof Error) {
        console.error('   Message:', error.message);
      }
    }
  }
}

/**
 * Example usage
 * 
 * Set PRIVATE_KEY environment variable to enable betting
 */
export async function exampleCombinedStrategy() {
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

  // Create bot
  const bot = new CombinedBettingBot(sdk, {
    threshold: parseEther('100'), // Bet when round has less than 100 ETH
    betAmount: parseEther('5'), // Bet 5 ETH total
    squareCount: 5, // Bet on 5 least allocated squares
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

