# Changelog

All notable changes to `@slvr-labs/sdk` are documented here. This project follows
[Semantic Versioning](https://semver.org/); while `0.x`, the public API may still
change between minor versions.

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
