/**
 * Example exports
 * 
 * Import and use these examples to understand how to use the Slvr SDK
 */

// Base strategy class for creating custom strategies
export { BettingStrategy, StrategyConfig, BetDecision } from './strategy-base';

// Pre-built strategies
export { AutomatedBettingBot, exampleAutomatedBetting } from './automated-betting';
export { LeastAllocatedStrategy, exampleLeastAllocatedStrategy } from './least-allocated-strategy';
export { CombinedBettingBot, exampleCombinedStrategy } from './combined-strategy';
export { ExpectedValueBot, exampleExpectedValueBot } from './expected-value-strategy';
export type { ExpectedValueBotOptions } from './expected-value-strategy';
export { FixedSquaresStrategy, exampleFixedSquaresStrategy, FixedSquaresConfig } from './fixed-squares-strategy';

// Custom strategy examples
export {
  LeastAllocatedCustomStrategy,
  RandomSquaresStrategy,
  MostBettorsStrategy,
  WeightedAllocationStrategy,
  ConditionalStrategy,
} from './custom-strategy-example';

// Utilities
export { simpleExample } from './simple-example';
export { CONTRACTS, ROBINHOOD_CHAIN } from './constants';

