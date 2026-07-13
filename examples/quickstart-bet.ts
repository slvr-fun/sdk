/**
 * Quickstart 2 — place a bet with a wallet
 * ========================================
 *
 * The minimal write path: build a wallet-backed SDK, sanity-check the round's
 * expected value, place one small bet, and print how to claim once the round
 * resolves. Bets are paid in native ETH (no token approval needed).
 *
 * Run it (uses a tiny stake by default — start on a testnet / small amount):
 *   PRIVATE_KEY=0xabc... npx ts-node quickstart-bet.ts
 *
 * To use this in your own project, change the `../src` import to `@slvr-labs/sdk`.
 */

import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SlvrSDK, robinhoodChain, deployments } from '../src';

// How much to bet, total, and which squares to spread it across (indices 0–24).
const STAKE_ETH = '0.002';
const SQUARES = [0, 12, 24];

async function main() {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) throw new Error('Set PRIVATE_KEY to a funded key on Robinhood Chain');

  // 1. Wallet-backed SDK from the shipped chain + addresses.
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
  const walletClient = createWalletClient({ chain: robinhoodChain, transport: http(), account });
  const sdk = new SlvrSDK({ publicClient, walletClient, addresses: deployments.robinhood.addresses });

  console.log(`Account: ${account.address}`);
  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log(`ETH balance: ${formatEther(ethBalance)}\n`);

  // 2. Pick the current round and make sure it's open.
  const roundId = await sdk.lottery.currentRoundId();
  if (!(await sdk.lottery.roundOpen(roundId))) {
    console.log(`Round #${roundId} is closed for betting — try again next round.`);
    return;
  }

  // 3. Optional sanity check: is mining this round +EV right now?
  //    (Informational — we bet regardless in this demo.)
  const ev = await sdk.estimateRoundEv({ stake: Number(STAKE_ETH) });
  console.log(
    `Round #${roundId} EV @ ${STAKE_ETH} ETH: ` +
      `${ev.netEth >= 0 ? '+' : ''}${ev.netEth.toFixed(6)} ETH/round ` +
      `(${ev.profitable ? 'profitable' : 'not profitable'}; break-even pot ${ev.breakEvenPot.toFixed(4)} ETH)`
  );

  // 4. Split the stake evenly across the chosen squares and bet.
  const stakeWei = parseEther(STAKE_ETH);
  const per = stakeWei / BigInt(SQUARES.length);
  const amounts = SQUARES.map((_, i) => (i === 0 ? per + (stakeWei - per * BigInt(SQUARES.length)) : per));

  console.log(`\nBetting ${STAKE_ETH} ETH on squares ${SQUARES.join(', ')}…`);
  const txHash = await sdk.lottery.bet({ roundId, squares: SQUARES, amounts });
  console.log(`✅ Bet placed: ${txHash}`);

  // 5. How to collect. Rounds resolve after betting closes; you can only claim a
  //    round you won (held the winning square) and haven't claimed yet.
  console.log(`\nTo claim after the round resolves:`);
  console.log(`  const canClaim = await sdk.canClaim(${roundId}n, "${account.address}");`);
  console.log(`  if (canClaim) await sdk.lottery.claim({ roundId: ${roundId}n });`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
