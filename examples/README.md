# Slvr SDK Examples

This directory contains reference implementations demonstrating how to use the Slvr SDK for various betting strategies and automation.

> **How to use these:** they are reference code, not part of the importable API.
> Copy the file(s) you want into your own project and change the relative
> `../src` import at the top of each file to `@slvr-labs/sdk`. The import paths in the
> snippets below (e.g. `from './fixed-squares-strategy'`) assume you've copied
> the example files alongside your own code.

## Getting Started

Brand new to the SDK? Run these two first — they use the addresses and chain that
ship with the SDK (`deployments.robinhood` + `robinhoodChain`), so there's nothing
to configure.

### `quickstart-read.ts` — read-only tour (no wallet)

The fastest way to confirm everything works. Needs only an RPC — no private key.
Prints the current round, pot, and the SLVR price in **both ETH and USD**.

```bash
npx ts-node quickstart-read.ts
npx ts-node quickstart-read.ts 0xYourAddress   # also show that address's balance + bets
```

### `quickstart-bet.ts` — place a bet (wallet)

The minimal write path: builds a wallet-backed SDK, checks the round's expected
value, places one small bet, and shows how to claim after the round resolves. Bets
are paid in native ETH — no token approval needed.

```bash
PRIVATE_KEY=0xabc... npx ts-node quickstart-bet.ts
```

> Start with a small stake (the example defaults to 0.002 ETH). You can only claim
> a round you won and haven't already claimed.

## Strategy System

The SDK includes a flexible strategy system that makes it easy to create custom betting strategies. All strategies extend the `BettingStrategy` base class, which handles:
- Round monitoring
- Threshold checking
- Error handling
- Bet execution

### Creating Custom Strategies

Extend `BettingStrategy` and override these methods:
- `selectSquares()` - Choose which squares to bet on
- `calculateAmounts()` - Calculate bet amounts for each square
- `shouldBet()` - Optional: Add custom conditions for betting
- `onBetPlaced()` - Optional: Handle successful bets
- `onError()` - Optional: Custom error handling

### Example: Fixed Squares Strategy

The simplest strategy - bet on the same squares every round:

```typescript
import { FixedSquaresStrategy } from './fixed-squares-strategy';
import { parseEther } from 'viem';

const strategy = new FixedSquaresStrategy(sdk, {
  squares: [0, 5, 10, 15, 20], // Bet on these squares
  amountPerSquare: parseEther('1'), // 1 ETH per square
  threshold: parseEther('100'), // Only bet when round < 100 ETH
  checkInterval: 5000, // Check every 5 seconds
});

await strategy.start();
```

### Example: Custom Strategy

```typescript
import { BettingStrategy } from './strategy-base';

class MyCustomStrategy extends BettingStrategy {
  protected async selectSquares(roundId: bigint): Promise<number[]> {
    // Your logic to select squares
    return [0, 1, 2, 3, 4];
  }

  protected async calculateAmounts(
    roundId: bigint,
    round: any,
    squares: number[]
  ): Promise<bigint[]> {
    // Your logic to calculate amounts
    return squares.map(() => parseEther('1'));
  }
}

const strategy = new MyCustomStrategy(sdk, {
  threshold: parseEther('100'),
  checkInterval: 5000,
});

await strategy.start();
```

## Examples

### 1. Fixed Squares Strategy (`fixed-squares-strategy.ts`)

Bet on a fixed set of squares every round when threshold is met.

**Usage:**
```typescript
import { FixedSquaresStrategy } from './fixed-squares-strategy';
import { parseEther } from 'viem';

const strategy = new FixedSquaresStrategy(sdk, {
  squares: [0, 5, 10, 15, 20],
  amountPerSquare: parseEther('1'),
  threshold: parseEther('100'),
  checkInterval: 5000,
});

await strategy.start();
```

### 3. Automated Betting Bot (`automated-betting.ts`)

A bot that automatically monitors rounds and places bets when the total wager is below a threshold (e.g., 100 ETH). It distributes bets across squares with the least allocation.

**Features:**
- Monitors rounds at configurable intervals
- Automatically bets when total wager < threshold
- Targets squares with least allocation
- Configurable bet amounts and square counts

**Usage:**
```typescript
import { AutomatedBettingBot } from './automated-betting';
import { parseEther } from 'viem';

const bot = new AutomatedBettingBot(sdk, {
  threshold: parseEther('100'), // Bet when round has < 100 ETH
  betAmount: parseEther('1'), // 1 ETH per square
  minSquares: 3,
  maxSquares: 5,
  checkInterval: 5000, // Check every 5 seconds
});

await bot.start();
// ... later
bot.stop();
```

### 2. Least Allocated Strategy (`least-allocated-strategy.ts`)

A strategy class that helps identify and bet on squares with the least funds allocated.

**Features:**
- Get squares sorted by allocation
- Calculate optimal bet distribution
- Analyze round allocation patterns
- Place bets on least allocated squares

**Usage:**
```typescript
import { LeastAllocatedStrategy } from './least-allocated-strategy';
import { parseEther } from 'viem';

const strategy = new LeastAllocatedStrategy(sdk);
const roundId = await sdk.lottery.currentRoundId();

// Analyze the round
const analysis = await strategy.analyzeRound(roundId);
console.log('Least allocated:', analysis.leastAllocated);

// Place a bet
const txHash = await strategy.betOnLeastAllocated(
  roundId,
  parseEther('5'), // 5 ETH total
  5 // Bet on 5 squares
);
```

### 4. Combined Strategy (`combined-strategy.ts`)

Combines both strategies: monitors for low total wager AND bets on least allocated squares.

**Features:**
- Monitors rounds for total wager < threshold
- Automatically identifies least allocated squares
- Provides detailed logging and analysis
- Configurable parameters

**Usage:**
```typescript
import { CombinedBettingBot } from './combined-strategy';
import { parseEther } from 'viem';

const bot = new CombinedBettingBot(sdk, {
  threshold: parseEther('100'), // Bet when < 100 ETH
  betAmount: parseEther('5'), // 5 ETH total bet
  squareCount: 5, // Bet on 5 least allocated squares
  checkInterval: 5000, // Check every 5 seconds
});

await bot.start();
// ... later
bot.stop();
```

### 6. Expected-Value Bot (`expected-value-strategy.ts`)

The most "quant" example: it **only bets when the round is positive expected
value**. It uses the SDK's built-in grid-mining calculator (`sdk.estimateRoundEv`
/ `computeGridMiningEv`) and SLVR price reader (`sdk.price`), so its math matches
the protocol's own edge calculator.

**How it decides:** the winning square is drawn uniformly, so mining SLVR only
pays while the pot is small enough that your SLVR reward beats the ETH you bleed
to the protocol fee. The bot computes net EV per round and bets when it clears a
threshold — otherwise it waits for the pot to shrink or SLVR to rise.

**Features:**
- Live pot / emission / SLVR price pulled on-chain each round
- Logs the full EV breakdown (share, SLVR mined, ETH bleed, jackpot, net, break-even pot)
- Bets only on +EV rounds, covering the grid proportionally so it holds the winner
- Hold vs cash-out mode (accounts for the 10% refining fee when cashing SLVR to ETH)

**Usage:**
```typescript
import { ExpectedValueBot } from './expected-value-strategy';

const bot = new ExpectedValueBot(sdk, {
  stakeEth: 0.1,     // commit 0.1 ETH per +EV round
  minNetEth: 0,      // bet on any positive-EV round (raise to demand more edge)
  cashOut: false,    // value mined SLVR at full price (holding/staking it)
  // ethUsd: 1815,   // optional override; otherwise the Chainlink feed is used
  checkInterval: 5000,
});

await bot.start();
// ... later
bot.stop();
```

The bot logs the SLVR price in **both ETH and USD**. USD comes from the SDK's
Chainlink ETH/USD feed (`sdk.ethUsd`), which is wired for Robinhood Chain, so USD
shows automatically. Pass `ethUsd` (or run with `ETH_USD=1815 …`) to override it,
or on a chain without a feed.

> Requires a `slvrEthPair` address so `sdk.price` works — it's included in
> `deployments.robinhood.addresses`, which this example uses.

## Running Examples

### 1. Install dependencies

From the `sdk/ts` directory:

```bash
npm install
```

### 2. Run an example

The examples are TypeScript. The simplest way to run one is with `ts-node` via
`npx` (it's fetched on demand — no global install needed):

```bash
# Read-only — needs nothing but an internet connection:
npx ts-node examples/quickstart-read.ts

# Pass an address to also see its balance/bets:
npx ts-node examples/quickstart-read.ts 0xYourAddress
```

> Prefer to compile? `npx tsc` then `node dist-examples/...` also works. `ts-node`
> just skips the build step.

### 3. Add a private key (only for examples that bet)

Read-only examples (like `quickstart-read.ts`) need **no key**. Examples that send
transactions read your key from the `PRIVATE_KEY` environment variable. The
simplest, most reliable way is to set it inline for the one command:

```bash
PRIVATE_KEY=0xabc123... npx ts-node examples/quickstart-bet.ts
```

Or keep it in a file: copy `.env.example` to `.env`, put your key in it, then load
it into your shell before running (the examples don't auto-load `.env`):

```bash
cp .env.example .env          # then edit .env and paste your key
set -a; source .env; set +a   # load it into the environment
npx ts-node examples/quickstart-bet.ts
```

**Key safety — please read:**
- Use a **fresh / burner** key, not one holding real value.
- The account needs a **small amount of ETH on Robinhood Chain** — for gas, plus
  whatever you bet.
- **Never commit your key.** `.env` is git-ignored here; only `.env.example`
  (which has a dummy key) is tracked. Setting the key inline avoids a file entirely.

### 4. (Optional) Point at a custom deployment

`examples/constants.ts` defaults to the canonical Robinhood Chain mainnet addresses
that ship with the SDK (`deployments.robinhood`). Edit it only to target a local or
custom deployment.

### Environment Variables

- `PRIVATE_KEY` — your wallet key, hex with `0x` prefix. Required only for examples
  that send transactions; read-only examples ignore it.
- `ETH_USD` — optional ETH/USD override for USD display (otherwise the on-chain
  Chainlink feed is used).

### Basic Setup

All examples use the constants file and environment variables:

```typescript
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SlvrSDK } from '@slvr-labs/sdk';
import { CONTRACTS, ROBINHOOD_CHAIN } from './constants';

// ROBINHOOD_CHAIN is already a viem `Chain` — no need to wrap it.
const publicClient = createPublicClient({
  chain: ROBINHOOD_CHAIN,
  transport: http(),
});

// Get private key from environment
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error('PRIVATE_KEY environment variable is required');
}

const account = privateKeyToAccount(privateKey as `0x${string}`);
const walletClient = createWalletClient({
  chain: ROBINHOOD_CHAIN,
  transport: http(),
  account,
});

// Initialize SDK with contract addresses from constants
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
```

### 5. Custom Strategy Examples (`custom-strategy-example.ts`)

Several example custom strategies showing different approaches:
- `LeastAllocatedCustomStrategy` - Bet on squares with least allocation
- `RandomSquaresStrategy` - Bet on random squares
- `MostBettorsStrategy` - Bet on squares with most bettors (social proof)
- `WeightedAllocationStrategy` - Weight bets inversely by allocation
- `ConditionalStrategy` - Only bet when certain conditions are met

## Strategy Ideas

You can easily create your own strategies by extending `BettingStrategy`:

### 1. Equal Distribution Strategy
Bet equal amounts on all 25 squares to maximize coverage.

### 2. Historical Analysis
Analyze past rounds to identify patterns and bet accordingly.

### 3. Multi-Round Strategy
Spread bets across multiple rounds to diversify risk.

### 4. Time-Based Strategy
Adjust betting based on time remaining in the round.

### 5. Portfolio Strategy
Diversify across multiple strategies simultaneously.

## Safety Considerations

⚠️ **Important:** These examples are for educational purposes. When running automated bots:

1. **Test on testnet first** - Never run untested code on mainnet
2. **Set reasonable limits** - Don't bet more than you can afford to lose
3. **Monitor gas costs** - Frequent transactions can be expensive
4. **Handle errors gracefully** - Network issues can cause failures
5. **Respect rate limits** - Don't spam the network
6. **Secure your keys** - Never expose private keys in code

## Customization

All examples are designed to be easily customizable. You can:

- Adjust thresholds and amounts
- Modify square selection logic
- Add additional conditions
- Integrate with other services (notifications, analytics, etc.)
- Combine multiple strategies

## Contributing

Feel free to create your own examples and share them! Common patterns include:
- Integration with notification services
- Database logging
- Analytics and reporting
- Multi-account management
- Advanced risk management

