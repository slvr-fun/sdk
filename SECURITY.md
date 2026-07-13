# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report them privately via GitHub's **[Report a vulnerability](https://github.com/slvr-fun/sdk/security/advisories/new)**
(the repository's Security tab → "Report a vulnerability"). We'll acknowledge your
report and keep you updated on the fix.

## Scope

This is a client SDK — it builds and sends transactions but holds no funds and has
no privileged access. The most relevant concerns here are:

- correctness of on-chain reads / encoded calls,
- anything that could cause a bot to send an unintended or unsafe transaction.

The underlying smart contracts are out of scope for this repository.

## Using the SDK safely

- It moves real ETH and SLVR. Review your integration, start with small amounts,
  and use dedicated/burner keys — never a key holding significant value.
- Prices from `sdk.price` are spot reads from a UniswapV2 pair and are **not**
  manipulation-resistant; don't use them as a settlement oracle.
- The SDK is provided "as is", without warranty (see the [LICENSE](./LICENSE)).
