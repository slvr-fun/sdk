/**
 * Base strategy class for creating custom betting strategies
 * 
 * This provides a flexible framework for implementing betting strategies.
 * Extend this class and override methods to customize behavior.
 */

import { SlvrSDK } from '../src';
import { parseEther } from 'viem';

// Re-export for convenience
export { SlvrSDK };

/**
 * Configuration for a betting strategy
 */
export interface StrategyConfig {
  /** Threshold in wei - only bet when round total wager is below this */
  threshold?: bigint;
  /** How often to check rounds (in milliseconds) */
  checkInterval?: number;
  /** Whether to start checking immediately */
  startImmediately?: boolean;
}

/**
 * Result of evaluating whether to bet
 */
export interface BetDecision {
  shouldBet: boolean;
  reason?: string;
}

/**
 * Base class for betting strategies
 * 
 * Override methods to customize behavior:
 * - `shouldBet()` - Determine if conditions are met to place a bet
 * - `selectSquares()` - Choose which squares to bet on
 * - `calculateAmounts()` - Calculate bet amounts for each square
 * - `onBetPlaced()` - Called after a successful bet
 * - `onError()` - Called when an error occurs
 */
export abstract class BettingStrategy {
  protected sdk: SlvrSDK;
  protected config: Required<StrategyConfig>;
  protected isRunning: boolean = false;
  protected intervalId?: NodeJS.Timeout;
  protected currentRoundId?: bigint;

  constructor(sdk: SlvrSDK, config: StrategyConfig = {}) {
    this.sdk = sdk;
    this.config = {
      threshold: config.threshold ?? parseEther('100'),
      checkInterval: config.checkInterval ?? 5000,
      startImmediately: config.startImmediately ?? true,
    };
  }

  /**
   * Start the strategy
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Strategy is already running');
      return;
    }

    if (!this.sdk.getWalletClient()) {
      throw new Error('Wallet client required for betting strategies');
    }

    this.isRunning = true;
    console.log('🚀 Strategy started');
    this.logConfig();

    if (this.config.startImmediately) {
      await this.checkAndBet();
    }

    this.intervalId = setInterval(async () => {
      await this.checkAndBet();
    }, this.config.checkInterval);
  }

  /**
   * Stop the strategy
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
    console.log('🛑 Strategy stopped');
  }

  /**
   * Check if strategy is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Main loop: check round and place bet if conditions are met
   */
  protected async checkAndBet(): Promise<void> {
    try {
      const roundId = await this.sdk.lottery.currentRoundId();
      this.currentRoundId = roundId;

      // Check if round is open
      const isOpen = await this.sdk.lottery.roundOpen(roundId);
      if (!isOpen) {
        const timeRemaining = await this.sdk.getTimeRemaining(roundId);
        if (timeRemaining > 0) {
          this.onRoundNotOpen(roundId, timeRemaining);
        } else {
          this.onRoundEnded(roundId);
        }
        return;
      }

      // Get round data
      const round = await this.sdk.lottery.getRound(roundId);

      // Check threshold
      if (round.totalWager >= this.config.threshold) {
        this.onThresholdNotMet(roundId, round.totalWager);
        return;
      }

      // Evaluate if we should bet (custom logic)
      const decision = await this.shouldBet(roundId, round);
      if (!decision.shouldBet) {
        this.onBetSkipped(roundId, decision.reason);
        return;
      }

      // Select squares to bet on (custom logic)
      const squares = await this.selectSquares(roundId, round);
      if (squares.length === 0) {
        this.onBetSkipped(roundId, 'No squares selected');
        return;
      }

      // Calculate amounts (custom logic)
      const amounts = await this.calculateAmounts(roundId, round, squares);
      if (amounts.length !== squares.length) {
        throw new Error('Amounts array length must match squares array length');
      }

      // Place the bet
      this.logBetDetails(roundId, squares, amounts, round);
      const txHash = await this.sdk.lottery.bet({
        roundId,
        squares,
        amounts,
      });

      await this.onBetPlaced(roundId, txHash, squares, amounts);
    } catch (error) {
      await this.onError(error);
    }
  }

  /**
   * Override this to implement custom bet decision logic
   * @param roundId Current round ID
   * @param round Round data
   * @returns Decision whether to bet
   */
  protected async shouldBet(roundId: bigint, round: any): Promise<BetDecision> {
    // Default: bet if threshold is met
    return { shouldBet: true };
  }

  /**
   * Override this to implement custom square selection
   * @param roundId Current round ID
   * @param round Round data
   * @returns Array of square indices (0-24) to bet on
   */
  protected abstract selectSquares(roundId: bigint, round: any): Promise<number[]>;

  /**
   * Override this to implement custom amount calculation
   * @param roundId Current round ID
   * @param round Round data
   * @param squares Selected squares
   * @returns Array of bet amounts (one per square, in wei)
   */
  protected abstract calculateAmounts(
    roundId: bigint,
    round: any,
    squares: number[]
  ): Promise<bigint[]>;

  /**
   * Called after a successful bet
   * Override to add custom logic (logging, notifications, etc.)
   */
  protected async onBetPlaced(
    roundId: bigint,
    txHash: `0x${string}`,
    squares: number[],
    amounts: bigint[]
  ): Promise<void> {
    console.log(`✅ Bet placed! Round ${roundId}, TX: ${txHash}`);
  }

  /**
   * Called when an error occurs
   * Override to add custom error handling
   */
  protected async onError(error: unknown): Promise<void> {
    console.error('❌ Error in strategy:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }

  /**
   * Called when round is not open yet
   */
  protected onRoundNotOpen(roundId: bigint, timeRemaining: number): void {
    // Override for custom behavior
  }

  /**
   * Called when round has ended
   */
  protected onRoundEnded(roundId: bigint): void {
    // Override for custom behavior
  }

  /**
   * Called when threshold is not met
   */
  protected onThresholdNotMet(roundId: bigint, totalWager: bigint): void {
    // Override for custom behavior
  }

  /**
   * Called when bet is skipped
   */
  protected onBetSkipped(roundId: bigint, reason?: string): void {
    // Override for custom behavior
  }

  /**
   * Log configuration
   */
  protected logConfig(): void {
    console.log(`   Threshold: ${SlvrSDK.formatToken(this.config.threshold)} ETH`);
    console.log(`   Check interval: ${this.config.checkInterval / 1000}s`);
  }

  /**
   * Log bet details before placing
   */
  protected logBetDetails(
    roundId: bigint,
    squares: number[],
    amounts: bigint[],
    round: any
  ): void {
    const total = amounts.reduce((sum, amt) => sum + amt, 0n);
    console.log(`\n🎯 Round ${roundId} - Placing bet:`);
    console.log(`   Total wager: ${SlvrSDK.formatToken(round.totalWager)} ETH`);
    console.log(`   Squares: ${squares.join(', ')}`);
    squares.forEach((square, i) => {
      console.log(`   Square ${square}: ${SlvrSDK.formatToken(amounts[i])} ETH`);
    });
    console.log(`   Total bet: ${SlvrSDK.formatToken(total)} ETH`);
  }
}

