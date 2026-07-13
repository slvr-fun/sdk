---
name: building-slvr-bots
description: >-
  Build bots, scripts, keepers, or dApps that interact with SLVR — the on-chain
  grid lottery / grid-mining game on Robinhood Chain — using the @slvr-labs/sdk
  TypeScript SDK (built on viem). Use this whenever the user wants to place bets,
  claim winnings, "grid mine" SLVR, compute expected value (EV) of a round, read
  the SLVR price, stake veNFTs, automate an executor/keeper, or otherwise script
  anything involving SLVR, the SLVR grid lottery, @slvr-labs/sdk, or Robinhood
  Chain (chain id 4663) — even if the user doesn't name the SDK explicitly.
---

# Building SLVR bots with @slvr-labs/sdk

SLVR is an on-chain game on **Robinhood Chain** (EVM, chain id `4663`). Each
round has a **5×5 grid (25 squares)**. Players bet native ETH on squares; when the
round resolves, one square wins **uniformly at random** (`randomnessValue % 25`),
and that square's bettors split the ETH pot (pro-rata) plus freshly minted **SLVR**
("grid mining"). `@slvr-labs/sdk` wraps all of this with a typed, `viem`-based API.

This skill teaches you to build against it correctly. For the exhaustive method
list, read [`references/api.md`](references/api.md). For runnable end-to-end
programs, read the SDK's `examples/` (`quickstart-read.ts`, `quickstart-bet.ts`,
`expected-value-strategy.ts`).

## Setup

```bash
npm install @slvr-labs/sdk viem
```

The SDK **ships the chain and addresses** — never hand-roll `defineChain` or paste
contract addresses. Fastest path is `SlvrSDK.connect` (builds resilient clients
with Multicall3 batching + retries):

```typescript
import { SlvrSDK } from '@slvr-labs/sdk';
const sdk = SlvrSDK.connect();                                // read-only
const bot = SlvrSDK.connect({ privateKey: process.env.PK });  // wallet-backed
```

Or construct it yourself — read-only needs just a public client; add a wallet
client for transactions:

```typescript
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SlvrSDK, robinhoodChain, deployments } from '@slvr-labs/sdk';

// Read-only (no key needed — reads only):
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
const sdk = new SlvrSDK({ publicClient, addresses: deployments.robinhood.addresses });

// Wallet-backed (for bet/claim/stake/etc.):
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({ chain: robinhoodChain, transport: http(), account });
const sdkW = new SlvrSDK({ publicClient, walletClient, addresses: deployments.robinhood.addresses });
```

`deployments.robinhood.addresses` covers `lottery`, `staking` (the veNFT staker),
`token`, `autoCommit`, `voteEscrow`, `slvrEthPair`, and `chainlinkEthUsd`. Pass your
own `addresses` object to target a custom/local deployment.

**Value/units:** on-chain amounts are `bigint` **wei** — use viem's `parseEther`
(ETH string → wei) and `formatEther` (wei → string) at the boundaries. Squares are
`0`–`24`. Write methods require the wallet client and return a tx hash; wait for it
with `publicClient.waitForTransactionReceipt`.

## Recipe: read the current round

```typescript
const roundId = await sdk.lottery.currentRoundId();
const [open, squares] = await Promise.all([
  sdk.lottery.roundOpen(roundId),
  sdk.lottery.getRoundSquares(roundId), // [{ square, total, bettors }] × 25
]);
const pot = squares.reduce((sum, s) => sum + s.total, 0n);
```

Gate "can I still bet?" on **`bettingEnd(roundId)`** (a unix-seconds timestamp),
not on `roundEnd` — betting can close before the round ends.

## Recipe: place a bet

Bets are paid in **native ETH** (the SDK sends `value` = sum of `amounts`). **No
token approval is needed.** Spread a stake across one or more squares:

```typescript
import { parseEther } from 'viem';
const txHash = await sdkW.lottery.bet({
  roundId,
  squares: [3, 7, 12],
  amounts: [parseEther('0.001'), parseEther('0.001'), parseEther('0.001')],
});
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

Confirm it landed with `sdk.lottery.getUserBets(roundId, address)`.

## Recipe: claim winnings

You can only claim a round you **won** (held the winning square) and haven't already
claimed. Let the SDK check for you:

```typescript
if (await sdk.canClaim(roundId, account.address)) {
  await sdkW.lottery.claim({ roundId });
}
// Multiple rounds:
const claimable = await sdk.getClaimableRounds(account.address, fromRound, toRound);
if (claimable.length) await sdkW.lottery.batchClaim(claimable);
```

To realize accumulated **mined SLVR** (separate from a round claim), use
`sdkW.lottery.withdrawUnrefinedSlvr()` (pays out SLVR net of the refining fee).

## Recipe: SLVR price in ETH and USD

SLVR/ETH comes from the UniswapV2 pair; USD uses the on-chain Chainlink ETH/USD
feed (wired for Robinhood Chain).

```typescript
const { eth, usd } = await sdk.getSlvrPrice();     // { eth: ETH per SLVR, usd: number | null }
const ethUsd = await sdk.getEthPriceUsd();          // Chainlink ETH/USD
```

`usd` is `null` only if there's no ETH/USD source; you can also pass one:
`sdk.getSlvrPrice({ ethUsd: 1815 })`.

## Recipe: bet only when the round is +EV (grid mining)

This is the key strategy. Because the winning square is uniform, mining SLVR is
profitable **only while the pot is small** — your SLVR reward must beat the ETH you
bleed to the protocol fee. The SDK ships the exact edge math:

```typescript
const ev = await sdk.estimateRoundEv({ stake: 0.1 /* ETH */, cashOut: false });
// ev: { share, ethBleed, slvrMined, slvrValueEth, jackpotEvEth, netEth,
//       edgeRatio, breakEvenPot, breakEvenSlvrPriceEth, profitable }
if (ev.profitable) {
  // pot is below break-even → mine this round
}
```

`estimateRoundEv` pulls pot/emission/price on-chain. For a pure calculation (no
I/O), use `computeGridMiningEv({ stake, pot, emissionPerRound, slvrPriceEth, ... })`.
Mental model: **ETH is ~a wash minus the ~10% fee; SLVR emission is the real
yield; bet when `pot < ev.breakEvenPot`.** Bet size cancels out — the edge depends
on pot vs SLVR price, not how much you bet.

See `examples/expected-value-strategy.ts` for a complete EV bot loop.

## Recipe: veNFT staking

Staking is by veNFT **tokenId** (not a raw ERC20 amount):

```typescript
await sdkW.staking.stake(tokenId);
const pending = await sdk.staking.getStakerRewards(tokenId);
await sdkW.staking.claimStakerRewards(tokenId);
await sdkW.staking.unstake(tokenId);
```

## Gotchas that will bite you

- **Bets are native ETH**, not an ERC20 — no `approve` step; the SDK attaches `value`.
- **Gate on `bettingEnd`**, not `roundEnd`. A closed round's `bet()` reverts.
- **`getUserBet` returns 0 after a claim** (the bet is zeroed on claim). To tell
  "didn't bet" from "already claimed", pair it with `getHasClaimed(roundId, user)`.
- **Emission is hub-gated**: `slvrPerRound` is a *target*; actual minted SLVR can be
  lower. Treat EV as an estimate, not a guarantee.
- **Read-only vs write**: reads work without a wallet client; any write throws
  `WalletClientRequiredError` if you forgot to pass one.
- The SDK exposes **public-use** methods only. Keeper/admin plumbing (round
  resolution, fee routing) is intentionally not included.

## Building a long-running bot

1. Poll `currentRoundId` on an interval (5–15s is plenty).
2. Skip rounds where `!roundOpen(roundId)` or you've already bet this round.
3. Decide with `estimateRoundEv` (or your own strategy over `getRoundSquares`).
4. Size + place the bet, wait for the receipt, log it.
5. Periodically sweep `getClaimableRounds` → `batchClaim`.
Handle RPC errors per-tick (try/catch) so one failure doesn't kill the loop, and
start with tiny stakes on a funded burner key.

## Using this skill with Codex (or any agent)

`SKILL.md` is plain, self-contained Markdown. To use it outside Claude Code, point
your agent at this file — e.g. reference `node_modules/@slvr-labs/sdk/skills/slvr-bot/SKILL.md`
from your `AGENTS.md`, or paste its contents into the agent's context. The
[`references/api.md`](references/api.md) file is the full method reference to load
when you need a signature you don't see above.
