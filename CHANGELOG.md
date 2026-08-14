# Changelog

All notable changes to `@slvr-labs/sdk` are documented here. This project follows
[Semantic Versioning](https://semver.org/); while `0.x`, the public API may still
change between minor versions.

## 0.4.1

### Changed
- `subgraphUrl` now points at `slvr-robinhood/1.9.0`, which indexes all three lottery generations
  plus the miner vault into the same continuous streams. 0.4.0 shipped pinned at 1.8.0 on purpose:
  1.9.0 is deployed at the cutover and does not exist until then, and a package pinned to a
  subgraph that has not been deployed hands every consumer a 404. Now that it is synced, this is
  the version to use — 0.4.0 reads a subgraph that stops at the previous generation, so its round
  history ends at round 33500.

## 0.4.0

The grid game migrated to the miner-vault generation at **round 33500** (2026-08-13). As with
every cutover only the game-layer contracts changed — but this one also moved WHERE miner state
lives, which changes how cashing out works and makes this the last migration that touches it.

### Added
- `sdk.minerVault` and the `SlvrMinerVault` class — mined SLVR, dividends and the refining clock
  now live in one vault (`addresses.minerVault`) shared by every generation from 33500 on.
  `withdraw()` cashes out the whole position; `getMinerState`, `pendingDividends`,
  `getRefiningFee` and `solvency` cover the reads; `migrateIn` and `migrationWindow` cover the
  one-time deposit window. Future lottery upgrades no longer move miner state at all.
- A third entry in `generations` ("Payload rollover", round 33500).

### Changed
- `addresses.lottery` now points at the vault-era lottery (`0xa1e5213…2A3D`); the gas-optimized
  contract moves to `lotteryLegacy` and stays claimable forever. `autoCommit`, `claimLockerV2`
  and `multiClaim` follow their generation the same way; `cutoverRound` is now 33500.
- The refining fee DECAYS on this generation: 20% on freshly mined SLVR falling linearly to 10%
  over 24 hours, priced at a per-wallet clock that BLENDS by weight on every credit (mining more
  does not reset it). Older generations keep their flat 10%.
- `subgraphUrl` still points at `slvr-robinhood/1.8.0`. The 1.9.0 index (all three generations
  plus the vault) is deployed at the cutover and moves here in a follow-up once it reports
  synced — pinning a subgraph before it exists is how consumers get a 404 for a deploy's worth
  of time, and CI enforces that this value matches subgraph/config/endpoint.json.

### Deprecated
- `lottery.withdrawUnrefinedSlvr()` is generation-bound: it keeps working against the two older
  generations (whose miner state is internal, claimable forever) and DOES NOT EXIST on vault-era
  lotteries. Use `sdk.minerVault.withdraw()` there. See MIGRATING.md.

## 0.3.0

Groundwork for repeated migrations, released ahead of the round-33500 cutover (this entry was
reconstructed from the release commit; 0.3.0 shipped without one).

### Added
- `generations` on `SlvrDeployment` — the full lottery generation chain, oldest first, replacing
  the single lottery/lotteryLegacy/cutoverRound triple as the way to route a historical read.
  Those three fields remain and now describe the newest boundary only.

## 0.2.0

The SLVR grid game migrated to a new lottery contract at **round 12500**. `bet()` fell from a
39k–5.67M range to 62k–281k. Only the lottery generation changed — token, vote escrow, staking,
pair and price feeds are the same contracts, and SLVR balances, miner state and veNFT locks are
untouched. See [MIGRATING.md](./MIGRATING.md).

### Changed
- `deployments.robinhood.addresses.lottery` now points at the gas-optimized lottery
  (`0xB0Cc994C…7b5f`); the previous contract moves to `lotteryLegacy` and stays fully
  resolvable and claimable, with no deadline.
- `addresses.autoCommit` now points at SlvrAutoCommitV3 (`0x6D5672…17ef`); the V2 contract moves
  to `autoCommitLegacy`, where existing plans keep their balances and keep being claimed.
- `subgraphUrl` moves to `slvr-robinhood/1.5.x`, which indexes both lottery generations into one
  continuous `Round` stream, so queries spanning the cutover need no special handling.

### Added
- `cutoverRound` on `SlvrDeployment` — the single number that routes a historical read:
  below it the round belongs to `lotteryLegacy`, at or above it to `lottery`.
- `addresses.multiClaim` — batch-claim helper for the current lottery.
- `LOCK_MODE` / `LockMode`, and an optional trailing `lockMode` on `configurePlan` and
  `configurePlanAndDeposit`. `LOCK_MODE.permanent` burns a plan's SLVR winnings into the user's
  permanent veNFT lock on every auto-claim with the 10% refining fee bypassed; it is
  irreversible and requires autoClaim. Omitting the argument keeps the V2 selector and V2
  behavior, so existing calls are unaffected.
- `planLockMode(user)` — reads a V3 plan's mode, and returns `null` against V2, so it doubles as
  a generation probe.
- `lotteryForRound(deployment, roundId)` — returns the contract that owns a round, so callers
  don't hand-roll the comparison against `cutoverRound`.
- `isMigrationLive(deployment, currentRoundId)` — whether the cutover has actually happened yet.
  A published package is a fixed artifact but the cutover is an event, so a release can land
  while `addresses.lottery` is deployed-but-not-yet-live. Gate betting on this if you upgrade
  ahead of a cutover. Returns `true` for deployments that never migrated, so it is safe to leave
  in permanently.

### Notes
- Nothing was removed. A 0.1.x integration keeps compiling; it will simply keep betting on the
  old game, which still works but no longer earns SLVR emission or jackpot eligibility.

## 0.1.2

### Fixed
- Expose `./package.json` in the `exports` map so tools that read it (some
  bundlers/plugins) resolve it instead of erroring on the subpath.

## 0.1.1

Initial public release.

### Features
- Typed, `viem`-based wrappers for the SLVR grid lottery, veNFT staking, token,
  and SlvrAutoCommitV2, plus read-only hub/registry/jackpot bindings.
- `SlvrSDK.connect()` / `createSlvrClients()` — one-line setup with resilient
  defaults (Multicall3 batching, timeouts, retries).
- Shipped `deployments.robinhood` addresses and a ready-made `robinhoodChain`.
- SLVR price in ETH **and** USD (UniswapV2 pair + Chainlink ETH/USD feed).
- Grid-mining expected-value math (`computeGridMiningEv`, `sdk.estimateRoundEv`),
  matching the protocol's edge calculator; auto-reads the jackpot pool.
- Batched reads via Multicall3 (`getRoundSquares`, `getUserBets`, `getRoundState`).
- Reactive helpers: `waitForResolution`, `watchRoundResolved`, `watchBets`.
- Preflight & robustness: `simulateBet`, typed reverts (`SlvrRevertError` /
  `decodeSlvrRevert`), and gas/nonce overrides on writes.
- Dual **ESM + CJS** build with type declarations.
- Bundled agent skill (`skills/slvr-bot`) and runnable examples.

### Notes
- Public-use surface only — keeper/admin tooling is intentionally excluded.
- Time helpers use on-chain `block.timestamp` (not the local clock).
