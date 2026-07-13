# Contributing

Thanks for your interest in `@slvr-labs/sdk`! Issues, ideas, and PRs are welcome.

## Heads up: this repo is a published mirror

This repository is generated from an upstream monorepo and re-synced on every
release, so direct pushes to `main` here are overwritten. That means:

- **Issues and discussion** — open them here, they're the best way to report bugs
  or request features.
- **Pull requests** — very welcome; a maintainer reviews them and applies accepted
  changes upstream (they'll then flow back into this repo). Keep PRs focused and
  include a clear description.

## Local development

```bash
npm install
npm run build        # tsup → dual ESM + CJS + type declarations
npm run typecheck    # tsc --noEmit
npm test             # vitest (unit tests)
```

### Running the integration tests

The integration tests hit a live/fork RPC and are skipped unless you point them at
one:

```bash
# against a local fork
anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8546 &
SLVR_TEST_RPC=http://127.0.0.1:8546 npm test

# preflight/simulation tests also need a burner key (no funds required)
SLVR_TEST_RPC=http://127.0.0.1:8546 SLVR_TEST_PK=0x... npm test
```

## Guidelines

- Match the surrounding code style; keep the public API `viem`-based and typed.
- Add or update tests for behavior changes (`test/*.test.ts`). Pure logic gets
  unit tests; anything on-chain goes in the guarded integration suite.
- Keep the SDK to the protocol's **public** surface — no keeper/admin-only tooling.
- Update the README (and the agent skill under `skills/`) when you add or change
  public API.
- This SDK moves real funds. Be conservative, and never commit keys or secrets.

By contributing, you agree your contributions are licensed under the project's
[MIT License](./LICENSE).
