/**
 * Quickstart 1 — read-only tour (no wallet needed)
 * ================================================
 *
 * The fastest way to confirm the SDK works. It needs nothing but an RPC — no
 * private key — and prints a snapshot of the live game: the current round, the
 * pot, and the SLVR price in both ETH and USD.
 *
 * Run it:
 *   npx ts-node quickstart-read.ts
 *   npx ts-node quickstart-read.ts 0xYourAddress   # also show that address's balance/bets
 *
 * To use this in your own project, change the `../src` import to `@slvr-labs/sdk`.
 */

import { createPublicClient, http, formatEther, isAddress, type Address } from 'viem';
import { SlvrSDK, robinhoodChain, deployments } from '../src';

async function main() {
  // 1. A read-only SDK: just a public client + the shipped mainnet addresses.
  //    No walletClient means write calls are disabled — reads are all we need here.
  const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
  const sdk = new SlvrSDK({
    publicClient,
    addresses: deployments.robinhood.addresses,
  });

  console.log(`Connected to ${robinhoodChain.name} (chain ${robinhoodChain.id})\n`);

  // 2. Current round + whether it's still open for betting.
  const roundId = await sdk.lottery.currentRoundId();
  const [isOpen, bettingEnd, squares] = await Promise.all([
    sdk.lottery.roundOpen(roundId),
    sdk.lottery.bettingEnd(roundId),
    sdk.lottery.getRoundSquares(roundId),
  ]);

  const pot = squares.reduce((sum, s) => sum + s.total, 0n);
  const totalBettors = squares.reduce((sum, s) => sum + s.bettors, 0n);
  const secondsLeft = Number(bettingEnd) - Math.floor(Date.now() / 1000);

  console.log(`Round #${roundId}`);
  console.log(`  status:     ${isOpen ? 'OPEN for betting' : 'closed'}`);
  console.log(`  betting ends: ${secondsLeft > 0 ? `in ~${secondsLeft}s` : 'passed'}`);
  console.log(`  pot:        ${formatEther(pot)} ETH across ${squares.length} squares`);
  console.log(`  bettors:    ${totalBettors}`);

  // 3. Prices — SLVR in ETH (from the UniswapV2 pair) and USD (via the Chainlink feed).
  const [slvr, ethUsd] = await Promise.all([sdk.getSlvrPrice(), sdk.getEthPriceUsd()]);
  console.log(`\nPrices`);
  console.log(`  ETH:  $${ethUsd.toFixed(2)}`);
  console.log(
    `  SLVR: ${slvr.eth.toExponential(4)} ETH` +
      (slvr.usd !== null ? `  ·  $${slvr.usd.toFixed(4)}` : '  ·  (USD unavailable)')
  );

  // 4. Token supply, for context.
  const [supply, maxSupply] = await Promise.all([
    sdk.token.totalSupply(),
    sdk.token.maxSupply(),
  ]);
  console.log(`\nSLVR supply: ${formatEther(supply)} / ${formatEther(maxSupply)} max`);

  // 5. Optional: pass an address to see its SLVR balance and bets this round.
  const who = process.argv[2];
  if (who && isAddress(who)) {
    const addr = who as Address;
    const [bal, bets] = await Promise.all([
      sdk.token.balanceOf(addr),
      sdk.lottery.getUserBets(roundId, addr),
    ]);
    console.log(`\n${addr}`);
    console.log(`  SLVR balance: ${formatEther(bal)}`);
    console.log(
      `  bets this round: ${
        bets.length ? bets.map((b) => `#${b.square}=${formatEther(b.amount)}ETH`).join(', ') : 'none'
      }`
    );
  } else if (who) {
    console.log(`\n(ignoring "${who}" — not a valid address)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
