/**
 * Simple example: Basic usage of the Slvr SDK
 * 
 * This is a minimal example showing how to:
 * 1. Initialize the SDK
 * 2. Get current round information
 * 3. Place a simple bet
 * 
 * Set PRIVATE_KEY environment variable to use wallet operations
 */

import { SlvrSDK } from '../src';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CONTRACTS, ROBINHOOD_CHAIN } from './constants';

/**
 * Simple example function
 */
export async function simpleExample() {
  // 1. Define the Robinhood chain
  const robinhood = defineChain(ROBINHOOD_CHAIN);

  // 2. Create public client for read operations
  const publicClient = createPublicClient({
    chain: robinhood,
    transport: http(),
  });

  // 3. Create wallet client for write operations (if private key is provided)
  let walletClient: ReturnType<typeof createWalletClient> | undefined;
  const privateKey = process.env.PRIVATE_KEY;
  
  if (privateKey) {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    walletClient = createWalletClient({
      chain: robinhood,
      transport: http(),
      account,
    });
    console.log(`Using account: ${account.address}`);
  } else {
    console.log('No PRIVATE_KEY found in environment - wallet operations disabled');
  }

  // 4. Initialize SDK
  const sdk = new SlvrSDK({
    publicClient,
    walletClient,
    addresses: {
      lottery: CONTRACTS.LOTTERY,
      staking: CONTRACTS.STAKING,
      token: CONTRACTS.TOKEN,
      autoCommit: CONTRACTS.AUTO_COMMIT !== '0x...' ? CONTRACTS.AUTO_COMMIT : undefined,
    },
  });

  // 4. Get current round
  const roundId = await sdk.lottery.currentRoundId();
  console.log(`Current round: ${roundId}`);

  // 5. Get round information
  const round = await sdk.lottery.getRound(roundId);
  console.log(`Round ${roundId}:`, {
    resolved: round.resolved,
    totalWager: SlvrSDK.formatToken(round.totalWager),
    winningSquare: round.winningSquare,
  });

  // 6. Check if round is open
  const isOpen = await sdk.lottery.roundOpen(roundId);
  console.log(`Round ${roundId} is ${isOpen ? 'open' : 'closed'} for betting`);

  // 7. Get squares data
  const squares = await sdk.lottery.getRoundSquares(roundId);
  console.log(`Square allocations:`, squares.map(sq => ({
    square: sq.square,
    total: SlvrSDK.formatToken(sq.total),
    bettors: Number(sq.bettors),
  })));

  // 8. Place a bet (requires wallet client)
  if (isOpen && walletClient) {
    const squaresToBet = [0, 1, 2]; // Square indices (0-24)
    const amounts = [
      parseEther('1'), // 1 ETH on square 0
      parseEther('1'), // 1 ETH on square 1
      parseEther('1'), // 1 ETH on square 2
    ];

    const txHash = await sdk.lottery.bet({
      roundId,
      squares: squaresToBet,
      amounts,
    });

    console.log(`Bet placed! Transaction: ${txHash}`);
  } else if (isOpen && !walletClient) {
    console.log('Cannot place bet - wallet client not available (set PRIVATE_KEY env var)');
  }

  // 9. Get user's bets (if wallet client is available)
  if (walletClient?.account) {
    const userAddress = walletClient.account.address;
    const userBets = await sdk.lottery.getUserBets(roundId, userAddress);
    console.log(`Your bets:`, userBets.map(bet => ({
      square: bet.square,
      amount: SlvrSDK.formatToken(bet.amount),
    })));

    // 10. Check if you can claim
    const canClaim = await sdk.canClaim(roundId, userAddress);
    if (canClaim) {
      console.log(`You can claim rewards for round ${roundId}`);
      // Uncomment to actually claim:
      // const txHash = await sdk.lottery.claim({ roundId });
      // console.log(`Claimed! Transaction: ${txHash}`);
    }
  }
}

