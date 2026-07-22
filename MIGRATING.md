# Migrating to `@slvr-labs/sdk` 0.2.0

At **round 12500** the SLVR grid game moved to a new, much cheaper lottery contract. The win is
as much about predictability as size: `bet()` used to swing between roughly 0.9M and 4.9M gas on
live traffic, spiking whenever a tile's bettor count crossed a power of two and the old Fenwick
tree rebuilt. It now stays in a narrow 62k–281k band. Nothing else about the protocol changed.

**Only the lottery generation changed.** The token, the vote escrow, the staking contract, the
SLVR/ETH pair and the price feeds are the same contracts they have always been. Your SLVR
balance, your unrefined miner state and your veNFT locks are not touched by any of this and
require no action.

## The short version

```bash
npm install @slvr-labs/sdk@latest
```

Bump the SDK, keep using it exactly as before, and you are done. `deployments.robinhood.addresses`
now points `lottery` at the new game, so new bets land in the right place automatically.

Two things need attention only if they apply to you: **an auto-commit plan** and **unclaimed
winnings from before round 12500**. Both are below.

## What moved

| Field | Before | After |
|---|---|---|
| `addresses.lottery` | `0x284Eb4…1c7f` | `0xB0Cc994C…7b5f` |
| `addresses.lotteryLegacy` | absent | `0x284Eb4…1c7f` |
| `addresses.autoCommit` | `0x314c8D…bb3B` (V2) | `0x6D5672…17ef` (V3) |
| `addresses.autoCommitLegacy` | absent | `0x314c8D…bb3B` |
| `addresses.claimLockerV2` | absent | `0x64e087…ee6C` |
| `addresses.multiClaim` | absent | `0x07e2b7…bEeF` |
| `cutoverRound` | absent | `12500` |

Nothing was removed, so a 0.1.x integration keeps compiling. It will just keep betting on the old
game, which still works but no longer earns SLVR emission or jackpot eligibility.

## If you are reading this BEFORE round 12500

0.2.0 may be published ahead of the cutover. If it is, `addresses.lottery` names a contract that
is **deployed but not yet live** — it accepts bets while minting no SLVR and holding no jackpot,
because its game is registered `Pending` until the cutover activates it.

Upgrading early is fine. Betting early is not. Gate on the round the chain is actually on:

```typescript
import { deployments, isMigrationLive } from '@slvr-labs/sdk';

const d = deployments.robinhood;
const current = await sdk.lottery.currentRoundId();

const bettingAddress = isMigrationLive(d, current)
  ? d.addresses.lottery                 // round >= 12500: the new game is live
  : d.addresses.lotteryLegacy!;         // before that: keep betting the old one
```

`isMigrationLive` returns `true` for deployments that never migrated, so this is safe to leave in
your code permanently. After 12500 it is simply always true and the branch collapses.

## Round numbers did not restart

The new lottery inherits the old genesis timestamp, so rounds keep counting straight through:
12499 was the last round on the old contract, 12500 the first on the new one. That makes
`cutoverRound` the only thing you need to route a historical read:

The SDK ships this as `lotteryForRound`, so you do not have to write the comparison:

```typescript
import { deployments, lotteryForRound } from '@slvr-labs/sdk';

const address = lotteryForRound(deployments.robinhood, 12_499); // previous generation
```

It returns `addresses.lottery` unchanged for deployments that never migrated.

## If you have unclaimed winnings from before 12500

They are safe, and they are not going anywhere — the old lottery was never paused, so its rounds
stay resolvable and claimable indefinitely. Claim them against `lotteryLegacy`:

```typescript
const legacy = new SlvrSDK({ addresses: { ...addresses, lottery: addresses.lotteryLegacy! } });
await legacy.lottery.claim(oldRoundId);
```

There is no deadline and no migration step for these. You can do it whenever.

## If you run an auto-commit plan

Plans do not move themselves — they hold ETH, and no one else gets to reassign your custody. So a
plan on the old auto-commit keeps its balance and stops placing new bets. Two transactions, in
this order, both against the **previous** contract:

```typescript
const legacy = new SlvrSDK({
  addresses: { ...addresses, autoCommit: addresses.autoCommitLegacy!, lottery: addresses.lotteryLegacy! },
});

// Sweep anything still owed to the plan. Winning rounds are discovered off-chain — the
// subgraph, or your own record of the plan's executed rounds.
await legacy.autoCommit!.claimFor(myAddress, unclaimedRoundIds);
// Then stop it and refund the remaining balance.
await legacy.autoCommit!.cancelPlan();
```

`cancelPlan` refunds the whole remaining balance but does not claim, so sweep first or you will
leave winnings behind that you then have to claim round by round afterwards.

Then start a fresh plan on the current contract:

```typescript
const sdk = new SlvrSDK({ addresses }); // 0.2.0 defaults — already the new generation
await sdk.autoCommit!.configurePlanAndDeposit(plays, amountPerPlay, squares, bpsAlloc, autoClaim, depositWei);
```

Even if you do nothing, the old plan's balance stays withdrawable and its winnings keep being
claimed for you. Only auto-*betting* stops.

### New in V3: fee-free permanent lock

V3 adds one option. A plan can burn its SLVR winnings straight into your permanent veNFT lock on
every auto-claim, at **0% refining fee** instead of the usual 10%:

```typescript
import { LOCK_MODE } from '@slvr-labs/sdk';

await sdk.autoCommit!.configurePlanAndDeposit(
  plays, amountPerPlay, squares, bpsAlloc,
  true,                   // autoClaim — required for any lock mode
  depositWei,
  LOCK_MODE.permanent,    // omit this argument entirely for V2 behavior
);
```

It requires auto-claim, since the lock happens as part of the claim. It is **irreversible** — a
permanent lock never unlocks — which is what buys the fee bypass.

Read a plan's current mode with `sdk.autoCommit!.planLockMode(user)`. It returns `null` against a
V2 contract, so it doubles as a generation probe.

The default is `LOCK_MODE.none`, which is exactly the V2 behavior: claim the ETH, leave the SLVR
unrefined in miner state where it keeps earning refining dividends. If you liked how V2 worked,
change nothing.

There is deliberately no auto-lock into a time-limited (TMAX) veNFT. It would charge the 10% fee
on every claim and buy nothing for it: the fee is proportional, so refining a little each round
costs the same percentage as refining once by hand later, and in between the SLVR gives up the
dividends it earns while unrefined. Lock to TMAX by hand whenever you want it.

## Subgraph

`deployments.robinhood.subgraphUrl` moves to `slvr-robinhood/1.5.x`, which indexes both lottery
generations into one continuous `Round` stream keyed by round id. Queries spanning the cutover
need no special handling.

## Checklist

- [ ] `npm install @slvr-labs/sdk@latest`
- [ ] Remove any hardcoded lottery address; read `deployments.robinhood.addresses.lottery`
- [ ] Route historical reads through `lotteryForRound()` if you query rounds below 12500
- [ ] If you upgraded BEFORE round 12500, gate betting on `isMigrationLive()`
- [ ] Claim pre-12500 winnings against `lotteryLegacy` (no deadline)
- [ ] If you run an auto plan: `claimFor()` then `cancelPlan()` on `autoCommitLegacy`, then
      configure a new plan on `autoCommit`
