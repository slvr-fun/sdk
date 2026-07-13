# @slvr-labs/sdk — API reference

Load this when you need a signature not shown in SKILL.md. All ETH/token amounts
are `bigint` **wei** unless noted; convert with viem `parseEther`/`formatEther`.
Squares are `0`–`24`. Write methods need a wallet client and return a tx hash
(`0x${string}`); wait with `publicClient.waitForTransactionReceipt`.

## Contents
- [Construction](#construction)
- [Deployments & chain](#deployments--chain)
- [SDK-level helpers](#sdk-level-helpers)
- [lottery](#sdklottery)
- [token](#sdktoken)
- [staking (veNFT)](#sdkstaking-venft)
- [autoCommit (V2)](#sdkautocommit-v2)
- [price / ethUsd](#sdkprice--sdkethusd)
- [Expected-value math](#expected-value-math-pure)
- [Optional read-only: hub / registry / jackpot](#optional-read-only-modules)
- [Events](#events)

## Construction
```typescript
new SlvrSDK({ publicClient, walletClient?, addresses })
```
- `addresses` shape: `{ lottery, staking, token, autoCommit?, voteEscrow?, slvrEthPair?, chainlinkEthUsd?, hub?, registry?, jackpot? }`
- Use `deployments.robinhood.addresses` for mainnet.
- `sdk.getPublicClient()`, `sdk.getWalletClient()`, `sdk.setWalletClient(wc)`.
- Static utils: `SlvrSDK.formatToken(value, decimals?, precision?)`, `SlvrSDK.parseToken(str, decimals?)`, `SlvrSDK.calculateBetAmounts(total, percentages[])`.

## Deployments & chain
- `deployments.robinhood`: `{ chainId: 4663, name, rpcUrl, blockExplorer, subgraphUrl, addresses }`.
- `robinhoodChain`: a ready-made viem `Chain`.
- `SlvrDeployment` type describes the shape.

## SDK-level helpers
- `getTimeRemaining(roundId): Promise<number>` — seconds until round end (0 if past).
- `canClaim(roundId, user): Promise<boolean>`.
- `getClaimableRounds(user, startRoundId, endRoundId): Promise<bigint[]>`.
- `getSlvrPriceInEth(): Promise<number>` — ETH per SLVR (needs `slvrEthPair`).
- `getSlvrPrice(opts?: { ethUsd?: number }): Promise<{ eth: number, usd: number | null }>`.
- `getEthPriceUsd(): Promise<number>` — Chainlink feed (needs `chainlinkEthUsd`).
- `estimateRoundEv(params): Promise<GridMiningEv>` — see [EV](#expected-value-math-pure).
- `effectiveEmissionRate(gameId)`, `pendingEmission(gameId)` — require `hub`(+`registry`).

## sdk.lottery
Reads:
- `currentRoundId()`, `roundStart(id)`, `roundEnd(id)`, `roundOpen(id)`, `bettingEnd(id)`, `latestResolvedRoundId()`.
- `getRound(id): Promise<RoundInfo>` — flat struct: `{ roundId, requestedAt, resolved, randomnessId, randomnessValue, winningSquare, jackpotHit, singleMinerRound, singleMinerWinner, totalWager, fee, winnerTotal, potForWinners, slvrForWinners, payoutMulWad, slvrMulWad, totalUnclaimedSlvr }`.
- `getTotalOnSquare(id, square)`, `getBettorsOnSquare(id, square)`, `getUserBet(id, square, bettor)`, `getHasClaimed(id, user)`, `hasAccount(account)`, `getDelegate(user, delegate)`.
- `getExpectedReward(account, id)` — estimated reward (wei).
- `getMinerState(account): Promise<MinerState>` — `{ rewardsSlvr, refinedAccrued, indexSnapshot, hasAccount }`.
- `getRoundSquares(id): Promise<Array<{ square, total, bettors }>>` (25 entries).
- `getUserBets(id, user): Promise<Array<{ square, amount }>>` (only nonzero).
- `slvrPerRound()` (emission target — hub-gated), `protocolFeeBps()`, `grid()`, `hasAccount(account)`, carry pools (`carryWinnerNativePool`, `carryStakerNativeOwed`, `carryJackpotNativeOwed`, `carrySlvrPool`).

Writes:
- `bet({ roundId, squares, amounts, beneficiary? })` — native ETH; `amounts` sum is the `value`.
- `betFor(...)` via `beneficiary` in `bet` params (bets on someone else's behalf).
- `claim({ roundId })`.
- `claimAdvanced({ user, roundId, recipientNative?, recipientSlvr?, bypassFee?, ethOnly? })`.
- `batchClaim(roundIds[], user?, { waitForReceipt? }?)` → `0x${string}[]`.
- `approveDelegate(delegate)`, `revokeDelegate(delegate)` — let a delegate claim for you.
- `donateSlvrToJackpot(amount)`, `addEthToJackpot(value)`.
- `withdrawUnrefinedSlvr()` — cash out mined SLVR (net of refining fee).
- `checkpoint(account)` — force-settle miner accrual (rarely needed; claim/withdraw do it).

## sdk.token
Reads: `totalSupply()`, `balanceOf(account)`, `allowance(owner, spender)`, `maxSupply()`, `name()`, `symbol()`, `decimals()`.
Writes: `transfer(to, amount)`, `approve(spender, amount)`, `transferFrom(from, to, amount)`, `burn(amount)`, `burnFrom(from, amount)`.

## sdk.staking (veNFT)
Keyed by veNFT `tokenId` (the `SlvrVoteEscrowStaking` contract).
Reads: `getStakerRewards(tokenId)`, `getTotalWeight()`/`totalWeight()`, `balance(tokenId)`, `rewards(tokenId)`, `rewardPerWeightStored()`, `rewardPerWeightPaid(tokenId)`, `unallocated()`, `lastDistributedRoundId()`, `lottery()`, `getStakingInfo(tokenId): Promise<{ totalWeight, balance, rewards, rewardPerWeightStored }>`.
Writes: `stake(tokenId)`, `unstake(tokenId)`, `claimStakerRewards(tokenId)`, `checkpoint(tokenId)`, `poke(tokenId)`, `pokeMany(tokenIds[])`.
> To stake, the veNFT must be owned/approved to the staking contract (`voteEscrow` address).

## sdk.autoCommit (V2)
A repeating bet plan; a keeper executes plays for you and is reimbursed metered gas
from your plan balance (`executeFor`/`claimFor` are permissionless — anyone can run
an executor and earn the fee). Present only if `autoCommit` address is configured.
- Reads: `planInfo(user)`, `needsExecution(user): { ready, reason }`, `executedRounds(user, roundId)`, `maxFeePerExecution()`, `feePremiumBps()`, consts (`UNLIMITED_PLAYS`, `MAX_PLAYS_PER_EXECUTION`, `MAX_CLAIMS_PER_EXECUTION`), `LOTTERY()`.
- Writes: `deposit(value)`, `withdraw(amount, to)`, `configurePlan(plays, amountPerPlay, squares, bpsAlloc, autoClaim)`, `configurePlanAndDeposit(..., value)`, `disablePlan()`, `cancelPlan()`, `executeFor(user, maxPlays, claimRounds[])`, `claimFor(user, claimRounds[])`.
- `bpsAlloc` entries must sum to `10000`.

## sdk.price / sdk.ethUsd
- `sdk.price` (`SlvrPrice`, present with `slvrEthPair`): `getReserves(): { slvrReserve, ethReserve, token0IsSlvr }`, `getPriceInEth(): number`, `getPriceInEthWad(): bigint`.
- `sdk.ethUsd` (`ChainlinkPriceFeed`, present with `chainlinkEthUsd`): `getPrice(): number`, `getRoundData(): { answer, decimals, updatedAt }`. Constructor accepts `{ maxStalenessSec }` to reject stale answers.

## Expected-value math (pure)
`computeGridMiningEv(input): GridMiningEv` — no I/O.
- Input: `{ stake, pot, emissionPerRound, slvrPriceEth, feeBps?, cashOut?, refineFeeBps?, jackpotPool?, jackpotOdds? }` (ETH-denominated numbers; `slvrPriceEth` = ETH per SLVR).
- Output `GridMiningEv`: `{ share, ethBleed, slvrMined, slvrValueEth, jackpotEvEth, netEthNoJackpot, netEth, edgeRatio, breakEvenPot, breakEvenSlvrPriceEth, profitable }`.
- Constants: `GRID_SIZE` (25), `SINGLE_SQUARE_WIN_PROBABILITY` (1/25), `PROTOCOL_FEE_BPS` (1000), `REFINING_FEE_BPS` (1000), `JACKPOT_ODDS` (625).
- `sdk.estimateRoundEv({ stake, roundId?, cashOut?, jackpotPool?, jackpotOdds?, emissionPerRound?, slvrPriceEth?, pot? })` reads pot/emission/price on-chain then calls `computeGridMiningEv`.

## Optional read-only modules
Only present when their address is configured (the live Robinhood deployment omits them).
- `sdk.registry` (`SlvrGameRegistry`): `gameIdOf`, `gameInfo`, `isActive`, `statusOf`, `tierOf`, `weightOf`, `maxWeightBpsOf`, `totalActiveWeight`, `gameCount`. Enums `GameStatus`, `GameTier`.
- `sdk.jackpot` (`SlvrJackpot`): `jackpotPool()`, `jackpotSlvrPool()`.
- `sdk.hub` (`SlvrHub`, read-only): `pendingEmission`, `emissionRatePerSec`, `targetSupply`, `maxAccrualSeconds`, `staking`, `jackpot`, `stakerSeq`, `pendingStakerRewards`.

## Events
Exported ABI groups for decoding logs (via `decodeEvent`/`decodeEvents`):
`SlvrGridLotteryEvents` (BetPlaced, Claimed, RoundResolved, RandomnessRequested),
`SlvrStakingEvents` (Staked, Unstaked, RewardClaimed, …, tokenId-keyed),
`SlvrTokenEvents` (Transfer, Approval), `SlvrAutoCommitEvents`.
