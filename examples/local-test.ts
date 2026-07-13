/**
 * Example SDK usage against local Anvil instance
 * 
 * Usage:
 *   1. Start local environment: ./scripts/start-local.sh
 *   2. Update contract addresses below
 *   3. Run: npx tsx examples/local-test.ts
 */

import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SlvrSDK } from '../src/index';

// Local Anvil configuration
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const CHAIN_ID = 31337;

// Update these addresses after deployment (from script/deployments/localhost.json)
const CONTRACT_ADDRESSES = {
  lottery: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Update this
  staking: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Update this (SlvrVoteEscrowStaking)
  token: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Update this
  autoCommit: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Optional
  hub: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Optional: SlvrHub
  registry: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Optional: SlvrGameRegistry
  jackpot: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Optional: SlvrJackpot
};

// The veNFT tokenId to inspect for staking (update after staking a token)
const STAKING_TOKEN_ID = 1n;

// Use Anvil's first account (or set your own private key)
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Define localhost chain
const localhostChain = {
  id: CHAIN_ID,
  name: 'Localhost',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
  },
} as const;

async function main() {
  console.log('🚀 Testing SLVR SDK against local Anvil instance\n');
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Chain ID: ${CHAIN_ID}\n`);

  // Create clients
  const publicClient = createPublicClient({
    chain: localhostChain,
    transport: http(RPC_URL),
  });

  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    chain: localhostChain,
    transport: http(RPC_URL),
    account,
  });

  console.log(`Using account: ${account.address}\n`);

  // Initialize SDK
  const sdk = new SlvrSDK({
    publicClient,
    walletClient,
    addresses: CONTRACT_ADDRESSES,
  });

  try {
    // Test 1: Get current round
    console.log('📊 Test 1: Get current round');
    const currentRoundId = await sdk.lottery.currentRoundId();
    console.log(`   Current round ID: ${currentRoundId}\n`);

    // Test 2: Get round info
    console.log('📊 Test 2: Get round info');
    const roundInfo = await sdk.lottery.getRound(currentRoundId);
    console.log(`   Round ${currentRoundId}:`, {
      totalWager: roundInfo.totalWager.toString(),
      resolved: roundInfo.resolved,
      winningSquare: roundInfo.winningSquare,
    });
    console.log('');

    // Test 3: Get token balance
    console.log('📊 Test 3: Get token balance');
    const tokenBalance = await sdk.token.balanceOf(account.address);
    console.log(`   SLVR balance: ${SlvrSDK.formatToken(tokenBalance)}\n`);

    // Test 4: Get staking info (veNFT staker, keyed by tokenId)
    console.log('📊 Test 4: Get staking info');
    const stakingInfo = await sdk.staking.getStakingInfo(STAKING_TOKEN_ID);
    console.log(`   Token ${STAKING_TOKEN_ID} weight: ${SlvrSDK.formatToken(stakingInfo.balance)}`);
    console.log(`   Total weight: ${SlvrSDK.formatToken(stakingInfo.totalWeight)}`);
    console.log(`   Claimable rewards: ${SlvrSDK.formatToken(stakingInfo.rewards)}\n`);

    // Test 5: Place a bet (if you have ETH)
    console.log('📊 Test 5: Place a bet');
    const betAmount = parseEther('0.1');
    const squares = [5, 10, 15];
    const amounts = [
      betAmount / 3n,
      betAmount / 3n,
      betAmount / 3n + (betAmount % 3n), // Handle remainder
    ];

    console.log(`   Placing bet on squares ${squares.join(', ')}`);
    console.log(`   Total amount: ${SlvrSDK.formatToken(betAmount)} ETH`);

    // Uncomment to actually place the bet:
    // const txHash = await sdk.lottery.bet({
    //   roundId: currentRoundId,
    //   squares,
    //   amounts,
    // });
    // console.log(`   Transaction: ${txHash}`);
    // console.log('   Waiting for confirmation...');
    // await publicClient.waitForTransactionReceipt({ hash: txHash });
    // console.log('   ✅ Bet placed!\n');

    console.log('   (Skipped - uncomment in code to execute)\n');

    // Test 6: Emission / registry / jackpot stats (optional bindings)
    console.log('📊 Test 6: Emission / registry / jackpot stats');
    if (sdk.hub) {
      const rate = await sdk.hub.emissionRatePerSec();
      const target = await sdk.hub.targetSupply();
      console.log(`   Emission rate/sec: ${SlvrSDK.formatToken(rate)}`);
      console.log(`   Target supply: ${SlvrSDK.formatToken(target)}`);
    }
    if (sdk.registry) {
      const gameId = await sdk.registry.gameIdOf(CONTRACT_ADDRESSES.lottery);
      const totalWeight = await sdk.registry.totalActiveWeight();
      console.log(`   Lottery gameId: ${gameId}`);
      console.log(`   Total active weight: ${totalWeight}`);
      // Combined helper: game's weighted SLVR/sec share (requires hub + registry)
      if (sdk.hub && gameId > 0n) {
        const effRate = await sdk.effectiveEmissionRate(gameId);
        const pending = await sdk.pendingEmission(gameId);
        console.log(`   Effective emission rate: ${SlvrSDK.formatToken(effRate)}/sec`);
        console.log(`   Pending emission: ${SlvrSDK.formatToken(pending)}`);
      }
    }
    if (sdk.jackpot) {
      const ethPool = await sdk.jackpot.jackpotPool();
      const slvrPool = await sdk.jackpot.jackpotSlvrPool();
      console.log(`   Jackpot ETH pool: ${SlvrSDK.formatToken(ethPool)}`);
      console.log(`   Jackpot SLVR pool: ${SlvrSDK.formatToken(slvrPool)}`);
    }
    if (!sdk.hub && !sdk.registry && !sdk.jackpot) {
      console.log('   (No hub/registry/jackpot addresses configured - skipped)');
    }
    console.log('');

    console.log('✅ All tests completed!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();

