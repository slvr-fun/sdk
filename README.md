# @slvr-labs/sdk

TypeScript SDK for interacting with the Slvr protocol on Robinhood Chain.

## Installation

```bash
npm install @slvr-labs/sdk viem
```

## Quick Start

The fastest way — `SlvrSDK.connect` builds resilient clients (Multicall3
batching, timeouts, retries) and wires the SDK for you:

```typescript
import { SlvrSDK } from '@slvr-labs/sdk';

const sdk = SlvrSDK.connect();                                  // read-only, Robinhood Chain
const bot = SlvrSDK.connect({ privateKey: process.env.PK });    // wallet-backed (for bets/claims)

const roundId = await sdk.lottery.currentRoundId();
```

Need the clients yourself? `createSlvrClients(opts)` returns `{ publicClient,
walletClient?, chain }` with the same defaults. Or wire everything manually:

```typescript
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SlvrSDK, robinhoodChain, deployments } from '@slvr-labs/sdk';

// `robinhoodChain` and `deployments.robinhood` ship with the SDK — no need to
// hand-roll the chain or copy addresses around.
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
});

const walletClient = createWalletClient({
  chain: robinhoodChain,
  transport: http(),
  account,
});

const sdk = new SlvrSDK({
  publicClient,
  walletClient,
  addresses: deployments.robinhood.addresses,
});
```

`deployments.robinhood.addresses` provides the canonical mainnet `lottery`,
`staking` (the veNFT staker), `token`, and `autoCommit` (V2) addresses. The
optional `hub`, `registry`, and `jackpot` bindings are only created when their
addresses are supplied — the live Robinhood Chain deployment does not run the hub
architecture, so those are omitted and `sdk.hub` / `sdk.registry` / `sdk.jackpot`
are `undefined`. To point at a custom or local deployment, pass your own
`addresses` object instead.

> **Read-only usage:** `walletClient` is optional. Omit it to build a read-only
> SDK (round/pot/reward queries work); any write call then throws
> `WalletClientRequiredError`.

## Usage Examples

### Lottery Operations

#### Get Current Round

```typescript
const roundId = await sdk.lottery.currentRoundId();
console.log(`Current round: ${roundId}`);
```

#### Get Round Information

```typescript
const round = await sdk.lottery.getRound(roundId);
console.log(`Round ${roundId}:`, {
  resolved: round.resolved,
  winningSquare: round.winningSquare,
  totalWager: round.totalWager,
  potForWinners: round.potForWinners,
});
```

#### Place a Bet

```typescript
const currentRound = await sdk.lottery.currentRoundId();
const squares = [0, 1, 2, 3]; // Square indices (0-24)
const amounts = [
  1000000000000000000n, // 1 ETH
  2000000000000000000n, // 2 ETH
  1500000000000000000n, // 1.5 ETH
  500000000000000000n,  // 0.5 ETH
];

const txHash = await sdk.lottery.bet({
  roundId: currentRound,
  squares,
  amounts,
});
console.log(`Bet placed: ${txHash}`);
```

#### Claim Rewards

```typescript
const txHash = await sdk.lottery.claim({
  roundId: roundId,
});
console.log(`Claimed rewards: ${txHash}`);
```

#### Batch Claim Multiple Rounds

```typescript
const claimableRounds = await sdk.getClaimableRounds(
  userAddress,
  startRoundId,
  endRoundId
);

if (claimableRounds.length > 0) {
  const txHash = await sdk.lottery.batchClaim(claimableRounds);
  console.log(`Batch claimed ${claimableRounds.length} rounds: ${txHash}`);
}
```

#### Get Round Squares Data

```typescript
const squares = await sdk.lottery.getRoundSquares(roundId);
squares.forEach(({ square, total, bettors }) => {
  console.log(`Square ${square}: ${total} ETH from ${bettors} bettors`);
});
```

#### Get User's Bets

```typescript
const userBets = await sdk.lottery.getUserBets(roundId, userAddress);
userBets.forEach(({ square, amount }) => {
  console.log(`Square ${square}: ${amount} ETH`);
});
```

### Staking Operations

Staking is the veNFT-based `SlvrVoteEscrowStaking` contract. Stakers deposit a
vote-escrow NFT **by tokenId** (not a raw ERC20 amount); rewards accrue per unit of the
token's tracked weight and are claimed per tokenId.

#### Get Staking Info

```typescript
// tokenId is the veNFT you have staked (or want to inspect)
const stakingInfo = await sdk.staking.getStakingInfo(tokenId);
console.log({
  totalWeight: stakingInfo.totalWeight,             // total tracked weight across all staked tokens
  balance: stakingInfo.balance,                      // this token's tracked weight
  rewards: stakingInfo.rewards,                       // claimable rewards for this token
  rewardPerWeightStored: stakingInfo.rewardPerWeightStored, // accumulated reward per weight (1e18)
});
```

#### Stake a veNFT

```typescript
// Deposit the vote-escrow NFT by tokenId (the staking contract takes custody of it)
const stakeTx = await sdk.staking.stake(tokenId);
console.log(`Staked: ${stakeTx}`);
```

#### Unstake a veNFT

```typescript
const unstakeTx = await sdk.staking.unstake(tokenId);
console.log(`Unstaked: ${unstakeTx}`);
```

#### Claim Staking Rewards

```typescript
// Read claimable rewards for a token
const pending = await sdk.staking.getStakerRewards(tokenId);
console.log(`Claimable: ${SlvrSDK.formatToken(pending)}`);

// Claim them
const rewardTx = await sdk.staking.claimStakerRewards(tokenId);
console.log(`Rewards claimed: ${rewardTx}`);
```

#### Checkpoint / Poke

```typescript
// Refresh a token's reward accounting without claiming
await sdk.staking.checkpoint(tokenId);

// Refresh a token's tracked weight (e.g. after its veNFT weight changed)
await sdk.staking.poke(tokenId);

// Refresh many tokens' tracked weight in one call
await sdk.staking.pokeMany([tokenId1, tokenId2]);
```

### Token Operations

#### Get Token Balance

```typescript
const balance = await sdk.token.balanceOf(userAddress);
console.log(`Balance: ${SlvrSDK.formatToken(balance)} SLVR`);
```

#### Transfer Tokens

```typescript
const amount = SlvrSDK.parseToken('100'); // 100 SLVR
const txHash = await sdk.token.transfer(recipientAddress, amount);
console.log(`Transferred: ${txHash}`);
```

### Auto-Commit Operations

`sdk.autoCommit` wraps **SlvrAutoCommitV2**. You configure a repeating bet plan
and fund it; a keeper (anyone) later executes plays on your behalf and is
reimbursed their metered gas plus a small premium out of your plan balance —
there is no flat automation fee, and `executeFor` / `claimFor` are non-payable.

#### Configure Auto-Commit Plan

```typescript
const squares = [0, 1, 2, 3, 4];
const bpsAlloc = [2000, 2000, 2000, 2000, 2000]; // 20% each; must sum to 10000

const txHash = await sdk.autoCommit?.configurePlan(
  10,                    // number of plays (use UNLIMITED_PLAYS for open-ended)
  1000000000000000000n,  // amount per play (1 ETH), split across squares by bpsAlloc
  squares,
  bpsAlloc,
  true                   // autoClaim: keeper claims winnings back into your balance
);
```

#### Configure and Deposit in One Transaction

```typescript
const txHash = await sdk.autoCommit?.configurePlanAndDeposit(
  10,
  1000000000000000000n,
  squares,
  bpsAlloc,
  true,
  10000000000000000000n  // deposit 10 ETH (sent as msg.value)
);
```

#### Deposit / Withdraw

```typescript
const depositTx = await sdk.autoCommit?.deposit(5000000000000000000n);      // 5 ETH
const withdrawTx = await sdk.autoCommit?.withdraw(1000000000000000000n, to); // 1 ETH to `to`
```

#### Inspect a Plan

```typescript
const plan = await sdk.autoCommit?.planInfo(userAddress);
// { enabled, nextRoundId, playsRemaining, amountPerPlay, balance, autoClaim, squares, bpsAlloc, planStartRoundId }

const { ready, reason } = await sdk.autoCommit!.needsExecution(userAddress);
```

#### Execute a Plan (keeper side)

```typescript
// maxPlays caps the number of rounds executed this call; claimRounds are winning
// rounds to claim in the same tx (discover them off-chain; empty array is fine).
const executeTx = await sdk.autoCommit?.executeFor(userAddress, 5, []);

// Claim only, without executing new plays:
const claimTx = await sdk.autoCommit?.claimFor(userAddress, [roundId1, roundId2]);
```

### Hub Operations (optional)

The `SlvrHub` is the protocol emission/sink router. It gates per-game SLVR emission and
fans many games into a single shared veNFT staker stream and a single shared jackpot.
Available as `sdk.hub` when a `hub` address is configured.

This is a read-only, informational surface — the hub's fee-routing writes are
keeper/protocol operations and are not part of the SDK.

```typescript
// Emission stats
const rate = await sdk.hub!.emissionRatePerSec();     // base SLVR/sec across the active game set
const target = await sdk.hub!.targetSupply();          // soft-cap target supply (0 => token MAX_SUPPLY)
const pending = await sdk.hub!.pendingEmission(gameId); // accrued-but-unminted SLVR for a game
```

### Registry Operations (optional)

The `SlvrGameRegistry` is the source of truth for which games exist, their status/tier,
and their share of the shared emission stream. Available as `sdk.registry` when a
`registry` address is configured (read-only surface).

```typescript
const gameId = await sdk.registry!.gameIdOf(gameAddress); // 0 if not registered (ids are 1-based)
const info = await sdk.registry!.gameInfo(gameId);         // full GameInfo record
const active = await sdk.registry!.isActive(gameAddress);
const status = await sdk.registry!.statusOf(gameId);       // GameStatus enum
const tier = await sdk.registry!.tierOf(gameId);           // GameTier enum
const weight = await sdk.registry!.weightOf(gameId);       // this game's emission weight
const totalWeight = await sdk.registry!.totalActiveWeight(); // denominator for the emission split
```

### Jackpot Operations (optional)

The `SlvrJackpot` exposes the shared jackpot pool balances. Available as `sdk.jackpot`
when a `jackpot` address is configured (read-only surface).

```typescript
const ethPool = await sdk.jackpot!.jackpotPool();      // native (ETH) jackpot pool balance
const slvrPool = await sdk.jackpot!.jackpotSlvrPool(); // SLVR jackpot pool balance
```

### Emission Helpers

These SDK-level helpers combine hub + registry reads. `effectiveEmissionRate` requires
both `hub` and `registry` addresses; `pendingEmission` requires `hub`.

```typescript
// A game's weighted share of the global emission stream, in SLVR/sec
// (pre-cap: does not apply the per-game maxWeightBps ceiling)
const effRate = await sdk.effectiveEmissionRate(gameId);

// Accrued-but-unminted SLVR currently available to a game (pass-through to hub.pendingEmission)
const pending = await sdk.pendingEmission(gameId);
```

### Expected Value & SLVR Price

The SDK ships the protocol's **grid-mining edge** math (the same model as the web
calculator) plus a SLVR/ETH price reader, so a bot can decide when a round is
worth playing.

**The model in one line:** the winning square is drawn *uniformly* each round, so
mining SLVR is only profitable while the pot is small enough that your SLVR reward
beats the ETH you bleed to the protocol fee. Net EV per round:

```
netEth = (stake/pot) * emissionPerRound * slvrPriceEth * realize   // SLVR mined, valued in ETH
       - feeFraction * stake                                       // ETH bleed (the fee; the rest of the pot is a wash)
       + (1/jackpotOdds) * (stake/pot) * jackpotPool               // jackpot term
```

Because both terms scale with `stake`, the edge depends on **pot vs SLVR price**,
not bet size — mining pays while the pot is below the *break-even pot*.

#### Read the SLVR price (ETH and USD)

SLVR/ETH comes from the UniswapV2 pair (`slvrEthPair`). For USD, the SDK reads an
optional **Chainlink ETH/USD feed** (`chainlinkEthUsd`) and multiplies.

```typescript
// SLVR/ETH from the pair (requires slvrEthPair, in deployments.robinhood.addresses).
const ethPerSlvr = await sdk.getSlvrPriceInEth();

// SLVR in BOTH ETH and USD:
const { eth, usd } = await sdk.getSlvrPrice();          // usd uses the Chainlink feed if configured, else null
const quote = await sdk.getSlvrPrice({ ethUsd: 1797.35 }); // …or pass ETH/USD from your own source

// ETH/USD directly (requires a chainlinkEthUsd feed):
const ethUsd = await sdk.getEthPriceUsd();

// Low-level readers:
const { slvrReserve, ethReserve } = await sdk.price!.getReserves();
```

> **Chainlink feed:** Robinhood Chain has a Chainlink ETH/USD feed (`ETH / USD`,
> 8 decimals), wired into `deployments.robinhood.addresses.chainlinkEthUsd`, so
> `getSlvrPrice()` / `getEthPriceUsd()` return USD out of the box. (An SVR proxy
> with identical price data also exists, at
> `0x5058aDee53b04e374d8bEDbAD634Bc4778F50b22`, for protocols integrating
> Chainlink SVR; for plain reads use the standard proxy that's wired here.) On a
> chain without a feed, set `addresses.chainlinkEthUsd` yourself or pass `ethUsd`.
> `ChainlinkPriceFeed` is exported if you want to read any aggregator directly.

#### Estimate a round's EV (live data)

```typescript
// Pulls pot, emission and SLVR price on-chain and returns the full breakdown.
const ev = await sdk.estimateRoundEv({
  stake: 0.1,          // ETH you'd commit this round
  cashOut: false,      // false = value SLVR at full price (holding); true = net of the 10% refining fee
  jackpotPool: 5.2,    // optional: ETH in the jackpot (not auto-read)
});

console.log(ev.netEth, 'ETH/round', ev.profitable, `(break-even pot ${ev.breakEvenPot} ETH)`);
```

#### Or compute it yourself (pure function, no I/O)

```typescript
import { computeGridMiningEv } from '@slvr-labs/sdk';

const ev = computeGridMiningEv({
  stake: 0.1,
  pot: 0.5,
  emissionPerRound: 1,     // SLVR minted to the winning square this round
  slvrPriceEth: 0.0005,    // ETH per SLVR (from sdk.getSlvrPriceInEth())
  jackpotPool: 5.2,        // optional
});
// -> { share, ethBleed, slvrMined, slvrValueEth, jackpotEvEth, netEth, edgeRatio,
//      breakEvenPot, breakEvenSlvrPriceEth, profitable }
```

See the [`expected-value-strategy.ts`](./examples/expected-value-strategy.ts) example
for a bot that only bets when a round is +EV. Exported constants `GRID_SIZE` (25),
`PROTOCOL_FEE_BPS`, `REFINING_FEE_BPS`, and `JACKPOT_ODDS` (625) document the on-chain
defaults.

### Reactive Helpers

Instead of hand-rolling polling loops, react to on-chain events or await
resolution:

```typescript
// Await a round's resolution (polls getRound under the hood) — e.g. bet, then claim.
const resolved = await sdk.lottery.waitForResolution(roundId, { timeoutMs: 300_000 });
if (await sdk.canClaim(roundId, address)) await sdk.lottery.claim({ roundId });

// Subscribe to events; each returns an unsubscribe function.
const stopResolved = sdk.lottery.watchRoundResolved((e) => {
  console.log(`round ${e.roundId} won by square ${e.winningSquare}`);
});
const stopBets = sdk.lottery.watchBets((e) => console.log(`bet of ${e.total} on round ${e.roundId}`));
// later: stopResolved(); stopBets();
```

### Helper Functions

#### Format Token Amounts

```typescript
const formatted = SlvrSDK.formatToken(1500000000000000000n); // "1.5"
// precision caps decimals; trailing zeros are stripped
const precise = SlvrSDK.formatToken(1234567890000000000n, 18, 6); // "1.234567"
```

#### Parse Token Amounts

```typescript
const amount = SlvrSDK.parseToken('1.5'); // 1500000000000000000n
```

#### Calculate Bet Amounts from Percentages

```typescript
const amounts = SlvrSDK.calculateBetAmounts(
  1000000000000000000n, // 1 ETH total
  [25, 25, 25, 25] // 25% each square
);
// Returns: [250000000000000000n, 250000000000000000n, 250000000000000000n, 250000000000000000n]
```

#### Get Time Remaining

```typescript
const timeRemaining = await sdk.getTimeRemaining(roundId);
console.log(`Time remaining: ${timeRemaining} seconds`);
```

## API Reference

### SlvrSDK

Main SDK class that provides access to all protocol contracts.

#### Constructor

```typescript
new SlvrSDK(config: SlvrConfig)
```

#### Properties

- `lottery: SlvrGridLottery` - Lottery contract interface
- `staking: SlvrStaking` - veNFT staking contract interface (`SlvrVoteEscrowStaking`)
- `token: SlvrToken` - Token contract interface
- `autoCommit?: SlvrAutoCommit` - Auto-commit contract interface (optional)
- `hub?: SlvrHub` - Emission/sink router interface, read-only (optional)
- `registry?: SlvrGameRegistry` - Game registry interface (optional)
- `jackpot?: SlvrJackpot` - Jackpot pool interface (optional)

#### Methods

- `getPublicClient(): PublicClient` - Get the public client
- `getWalletClient(): WalletClient | undefined` - Get the wallet client
- `setWalletClient(walletClient: WalletClient | undefined): void` - Update wallet client
- `getTimeRemaining(roundId: bigint): Promise<number>` - Get time remaining for a round
- `canClaim(roundId: bigint, user: Address): Promise<boolean>` - Check if user can claim
- `getClaimableRounds(user: Address, startRoundId: bigint, endRoundId: bigint): Promise<bigint[]>` - Get claimable rounds
- `effectiveEmissionRate(gameId: bigint): Promise<bigint>` - A game's weighted SLVR/sec share of the global emission stream (requires `hub` + `registry`)
- `pendingEmission(gameId: bigint): Promise<bigint>` - Accrued-but-unminted SLVR available to a game (requires `hub`)
- `getSlvrPriceInEth(): Promise<number>` - SLVR spot price in ETH (requires `slvrEthPair`)
- `getSlvrPrice(opts?: { ethUsd?: number }): Promise<PriceQuote>` - SLVR price in both ETH and USD (`usd` is `null` without an ETH/USD source)
- `getEthPriceUsd(): Promise<number>` - ETH/USD from the Chainlink feed (requires `chainlinkEthUsd`)
- `estimateRoundEv(params): Promise<GridMiningEv>` - per-round grid-mining EV, pulling pot/emission/price on-chain (requires `slvrEthPair` unless `slvrPriceEth` is passed)

#### Static Helpers

- `SlvrSDK.formatToken(value: bigint, decimals?: number, precision?: number): string`
- `SlvrSDK.parseToken(value: string, decimals?: number): bigint`
- `SlvrSDK.calculateBetAmounts(totalAmount: bigint, percentages: number[]): bigint[]`

### SlvrGridLottery

Interface for the lottery contract.

#### Read Methods

- `currentRoundId(): Promise<bigint>`
- `roundStart(roundId: bigint): Promise<bigint>`
- `roundEnd(roundId: bigint): Promise<bigint>`
- `roundOpen(roundId: bigint): Promise<boolean>`
- `bettingEnd(roundId: bigint): Promise<bigint>` - betting cutoff (unix seconds); can be earlier than `roundEnd` — gate bots on this
- `getExpectedReward(account: Address, roundId: bigint): Promise<bigint>` - estimated reward for an account in a round
- `latestResolvedRoundId(): Promise<bigint>`
- `getRound(roundId: bigint): Promise<RoundInfo>` - flat 16-value round tuple
- `getTotalOnSquare(roundId: bigint, square: number): Promise<bigint>`
- `getBettorsOnSquare(roundId: bigint, square: number): Promise<bigint>`
- `getUserBet(roundId: bigint, square: number, bettor: Address): Promise<bigint>`
- `getHasClaimed(roundId: bigint, user: Address): Promise<boolean>`
- `getMinerState(account: Address): Promise<MinerState>`
- `hasAccount(account: Address): Promise<boolean>`
- `getDelegate(user: Address, delegate: Address): Promise<boolean>`
- `slvrPerRound(): Promise<bigint>` - target SLVR/round; **emission is now hub-gated**, so this is the requested value, not the amount actually minted (bounded by `SlvrHub.pendingEmission`)
- `protocolFeeBps(): Promise<number>`
- `carryWinnerNativePool(): Promise<bigint>`
- `carryStakerNativeOwed(): Promise<bigint>`
- `carryJackpotNativeOwed(): Promise<bigint>`
- `carrySlvrPool(): Promise<bigint>`
- `getRoundSquares(roundId: bigint): Promise<Array<{square: number, total: bigint, bettors: bigint}>>`
- `getUserBets(roundId: bigint, user: Address): Promise<Array<{square: number, amount: bigint}>>`

#### Write Methods

- `bet(params: BetParams): Promise<0x${string}>`
- `claim(params: ClaimParams): Promise<0x${string}>`
- `claimAdvanced(params: ClaimParamsAdvanced): Promise<0x${string}>`
- `batchClaim(roundIds: bigint[], user?: Address, options?: { waitForReceipt?: boolean }): Promise<0x${string}[]>`
- `approveDelegate(delegate: Address): Promise<0x${string}>`
- `revokeDelegate(delegate: Address): Promise<0x${string}>`
- `donateSlvrToJackpot(amount: bigint): Promise<0x${string}>`
- `addEthToJackpot(value: bigint): Promise<0x${string}>`
- `withdrawUnrefinedSlvr(): Promise<0x${string}>` - cash out accumulated mined SLVR (net of the refining fee)
- `checkpoint(account: Address): Promise<0x${string}>` - force on-chain settlement of a miner's refined-reward accrual (rarely needed; `claim`/`withdrawUnrefinedSlvr` do it automatically)

### SlvrStaking (`SlvrVoteEscrowStaking`)

veNFT-based staker. All operations are keyed by veNFT `tokenId`.

#### Read Methods

- `getStakerRewards(tokenId: bigint): Promise<bigint>` - claimable rewards for a token
- `getTotalWeight(): Promise<bigint>`
- `totalWeight(): Promise<bigint>`
- `balance(tokenId: bigint): Promise<bigint>` - a token's tracked weight
- `rewards(tokenId: bigint): Promise<bigint>`
- `rewardPerWeightStored(): Promise<bigint>`
- `rewardPerWeightPaid(tokenId: bigint): Promise<bigint>`
- `unallocated(): Promise<bigint>`
- `lastDistributedRoundId(): Promise<bigint>`
- `lottery(): Promise<Address>`
- `getStakingInfo(tokenId: bigint): Promise<StakingInfo>`

#### Write Methods

- `stake(tokenId: bigint): Promise<0x${string}>`
- `unstake(tokenId: bigint): Promise<0x${string}>`
- `claimStakerRewards(tokenId: bigint): Promise<0x${string}>`
- `checkpoint(tokenId: bigint): Promise<0x${string}>`
- `poke(tokenId: bigint): Promise<0x${string}>`
- `pokeMany(tokenIds: bigint[]): Promise<0x${string}>`

### SlvrHub (optional, read-only)

Emission/sink router. Available as `sdk.hub` when a `hub` address is configured.
Informational reads only — the hub's fee-routing writes are keeper/protocol
operations and are not part of the SDK.

#### Read Methods

- `pendingEmission(gameId: bigint): Promise<bigint>`
- `emissionRatePerSec(): Promise<bigint>`
- `targetSupply(): Promise<bigint>`
- `maxAccrualSeconds(): Promise<bigint>`
- `staking(): Promise<Address>`
- `jackpot(): Promise<Address>`
- `stakerSeq(): Promise<bigint>`
- `pendingStakerRewards(): Promise<bigint>`

### SlvrGameRegistry (optional)

Read-only game registry. Available as `sdk.registry` when a `registry` address is configured.

#### Read Methods

- `gameIdOf(game: Address): Promise<bigint>`
- `gameInfo(gameId: bigint): Promise<GameInfo>`
- `isActive(game: Address): Promise<boolean>`
- `statusOf(gameId: bigint): Promise<GameStatus>`
- `tierOf(gameId: bigint): Promise<GameTier>`
- `weightOf(gameId: bigint): Promise<bigint>`
- `maxWeightBpsOf(gameId: bigint): Promise<number>`
- `totalActiveWeight(): Promise<bigint>`
- `gameCount(): Promise<bigint>`

### SlvrJackpot (optional)

Read-only jackpot pool. Available as `sdk.jackpot` when a `jackpot` address is configured.

#### Read Methods

- `jackpotPool(): Promise<bigint>` - native (ETH) pool balance
- `jackpotSlvrPool(): Promise<bigint>` - SLVR pool balance

### SlvrToken

Interface for the SLVR token contract.

#### Read Methods

- `totalSupply(): Promise<bigint>`
- `balanceOf(account: Address): Promise<bigint>`
- `allowance(owner: Address, spender: Address): Promise<bigint>`
- `maxSupply(): Promise<bigint>`

#### Write Methods

- `transfer(to: Address, amount: bigint): Promise<0x${string}>`
- `approve(spender: Address, amount: bigint): Promise<0x${string}>`
- `transferFrom(from: Address, to: Address, amount: bigint): Promise<0x${string}>`
- `burn(amount: bigint): Promise<0x${string}>`

### SlvrPrice (optional)

SLVR/ETH spot price reader. Available as `sdk.price` when a `slvrEthPair` address
is configured. Reads the UniswapV2 pair's reserves (resolving token order); spot
only, not a manipulation-resistant oracle.

#### Methods

- `getReserves(): Promise<{ slvrReserve: bigint, ethReserve: bigint, token0IsSlvr: boolean }>`
- `getPriceInEth(): Promise<number>` - ETH per SLVR
- `getPriceInEthWad(): Promise<bigint>` - ETH per SLVR as a 1e18-scaled bigint

### ChainlinkPriceFeed (optional)

Reads a Chainlink-style `AggregatorV3Interface` (e.g. an ETH/USD feed). Available
as `sdk.ethUsd` when a `chainlinkEthUsd` address is configured — wired for
Robinhood Chain in `deployments.robinhood`.

#### Methods

- `getPrice(): Promise<number>` - feed answer scaled by its decimals
- `getRoundData(): Promise<{ answer: bigint, decimals: number, updatedAt: bigint }>`
- Constructor accepts `{ maxStalenessSec }` to reject stale answers.

### Expected-value math

Pure functions and constants (no I/O):

- `computeGridMiningEv(input: GridMiningEvInput): GridMiningEv` - per-round EV breakdown
- Constants: `GRID_SIZE` (25), `SINGLE_SQUARE_WIN_PROBABILITY` (1/25), `PROTOCOL_FEE_BPS` (1000), `REFINING_FEE_BPS` (1000), `JACKPOT_ODDS` (625)

## Types

All TypeScript types are exported from the main module:

```typescript
import type {
  SlvrConfig,
  RoundInfo,
  MinerState,
  TreasuryState,
  StakingInfo,
  AutoCommitPlan,
  GameInfo,
  BetParams,
  ClaimParams,
  ClaimParamsAdvanced,
  GridMiningEvInput,
  GridMiningEv,
  SlvrReserves,
  PriceQuote,
  SlvrDeployment,
} from '@slvr-labs/sdk';

// GameStatus and GameTier are enums (runtime values), so import them as values:
import { GameStatus, GameTier } from '@slvr-labs/sdk';
```

The `StakingInfo` shape is now `{ totalWeight, balance, rewards, rewardPerWeightStored }`
(all `bigint`), reflecting the veNFT weight-based staker.

## Deployments

The SDK ships canonical addresses and a ready-made viem chain so you don't have
to copy either around:

```typescript
import { deployments, robinhoodChain } from '@slvr-labs/sdk';

deployments.robinhood.chainId;        // 4663
deployments.robinhood.rpcUrl;         // https://rpc.mainnet.chain.robinhood.com
deployments.robinhood.blockExplorer;  // https://robinhoodchain.blockscout.com/
deployments.robinhood.subgraphUrl;    // hosted subgraph GraphQL endpoint
deployments.robinhood.addresses;      // { lottery, staking, token, autoCommit, voteEscrow, slvrEthPair, chainlinkEthUsd, multicall3 }

robinhoodChain; // a viem `Chain` for createPublicClient/createWalletClient
```

Types: `SlvrDeployment` describes the shape. To target a local or custom
deployment, construct the SDK with your own `addresses` object instead.

### Batched reads (multicall)

`robinhoodChain` registers **Multicall3**, so the SDK's multi-square reads
(`getRoundSquares`, `getUserBets`) collapse from ~50 RPC calls into **one**. For
even more batching, create your client with `batch: { multicall: true }` — viem
then auto-batches every concurrent read (great for polling bots):

```typescript
const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
  batch: { multicall: true },
});
```

On a custom chain without Multicall3 configured, these methods transparently fall
back to individual reads.

## Build with an AI agent (Claude Code / Codex)

The package ships an **agent skill** at
[`skills/slvr-bot/`](./skills/slvr-bot/SKILL.md) so a coding agent can build SLVR
bots for you correctly — it knows the API, addresses, EV math, and gotchas.

- **Claude Code:** copy `skills/slvr-bot/` into your project's `.claude/skills/`
  (or reference `node_modules/@slvr-labs/sdk/skills/slvr-bot/`), then ask e.g.
  *"build me a bot that grid-mines SLVR only on +EV rounds."*
- **Codex / other agents:** the skill is plain Markdown — point your `AGENTS.md`
  at `node_modules/@slvr-labs/sdk/skills/slvr-bot/SKILL.md`, or paste it into context.

## Examples

The package ships runnable examples in the [`examples/`](./examples) directory
(also included in the published tarball). Copy the file you want into your project
and change the relative `../src` import to `@slvr-labs/sdk`.

**New here? Start with these two:**

| File | What it shows |
| --- | --- |
| [`quickstart-read.ts`](./examples/quickstart-read.ts) | **Start here.** Read-only tour — no wallet. Prints the round, pot, and SLVR price in ETH + USD |
| [`quickstart-bet.ts`](./examples/quickstart-bet.ts) | Minimal wallet flow — EV-check, place one bet, then claim |

Run them from `sdk/ts` with `ts-node` (fetched on demand via `npx`):

```bash
npm install
npx ts-node examples/quickstart-read.ts               # read-only, no key needed

# Examples that bet read your key from PRIVATE_KEY — set it inline for the command:
PRIVATE_KEY=0xabc... npx ts-node examples/quickstart-bet.ts
```

Use a **burner key** funded with a little ETH on Robinhood Chain — never a key with
real value, and never commit it. See the [examples README](./examples/README.md)
for the full run/setup guide (including `.env` usage). Then the strategy references:

| File | What it shows |
| --- | --- |
| [`simple-example.ts`](./examples/simple-example.ts) | Minimal read + single bet |
| [`strategy-base.ts`](./examples/strategy-base.ts) | `BettingStrategy` base class to extend |
| [`least-allocated-strategy.ts`](./examples/least-allocated-strategy.ts) | Bet the least-crowded squares |
| [`fixed-squares-strategy.ts`](./examples/fixed-squares-strategy.ts) | Always bet a fixed set of squares |
| [`combined-strategy.ts`](./examples/combined-strategy.ts) | Threshold + least-allocated bot loop |
| [`automated-betting.ts`](./examples/automated-betting.ts) | Long-running automated betting bot |
| [`expected-value-strategy.ts`](./examples/expected-value-strategy.ts) | **EV bot** — bets only when the round is +EV, using the grid-mining calculator + SLVR price |
| [`custom-strategy-example.ts`](./examples/custom-strategy-example.ts) | Several custom strategy variants |

See the [examples README](./examples/README.md) for a deeper walkthrough.

### Reference: Automated Betting Bot

The snippets below are copied from the examples; after copying a file into your
own project, import the SDK from `@slvr-labs/sdk` (not `../src`).

```typescript
import { CombinedBettingBot } from './combined-strategy'; // your copied file
import { parseEther } from 'viem';

// Create a bot that bets when round has < 100 ETH
// and targets squares with least allocation
const bot = new CombinedBettingBot(sdk, {
  threshold: parseEther('100'), // Bet when round < 100 ETH
  betAmount: parseEther('5'), // Bet 5 ETH total
  squareCount: 5, // Bet on 5 least allocated squares
  checkInterval: 5000, // Check every 5 seconds
});

await bot.start();
// Bot will automatically monitor and bet
```

### Reference: Least Allocated Strategy

```typescript
import { LeastAllocatedStrategy } from './least-allocated-strategy'; // your copied file

const strategy = new LeastAllocatedStrategy(sdk);
const roundId = await sdk.lottery.currentRoundId();

// Get squares with least allocation
const leastAllocated = await strategy.getLeastAllocatedSquares(roundId, 5);

// Place bet on these squares
const txHash = await strategy.betOnLeastAllocated(
  roundId,
  parseEther('5'), // 5 ETH total
  5 // Bet on 5 squares
);
```

See the [examples README](./examples/README.md) for more detailed examples and strategies.

## License

MIT

