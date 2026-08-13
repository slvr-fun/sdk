import { Address, defineChain } from 'viem';

/**
 * A known Slvr deployment: chain metadata plus the on-chain addresses the SDK needs.
 *
 * Addresses mirror the canonical values the production interface ships
 * (`interface/config/constants.ts`). `hub`, `registry`, and `jackpot` are only
 * present on deployments that run the emission/sink hub architecture — they are
 * omitted here for deployments that don't, and the corresponding `sdk.hub` /
 * `sdk.registry` / `sdk.jackpot` bindings will be `undefined`.
 */
/** One generation of the grid lottery, and the first round it owns. */
export interface SlvrGeneration {
  /** Short human label, e.g. "Payload rollover". */
  label: string;
  /** First round this generation owns. Round numbering is continuous across generations. */
  startRound: number;
  lottery: Address;
  autoCommit?: Address;
  claimLocker?: Address;
  multiClaim?: Address;
}

export interface SlvrDeployment {
  /** EVM chain id */
  chainId: number;
  /** Human-readable network name */
  name: string;
  /** Default JSON-RPC endpoint */
  rpcUrl: string;
  /** Block explorer base URL, if any */
  blockExplorer?: string;
  /** Goldsky/hosted subgraph GraphQL endpoint, if any */
  subgraphUrl?: string;
  /** Contract addresses, shaped to drop straight into `new SlvrSDK({ addresses })` */
  addresses: {
    /** SlvrGridLottery — the CURRENT game. Always play against this one. */
    lottery: Address;
    /**
     * The PREVIOUS SlvrGridLottery, after a game migration (optional).
     *
     * The grid game is migrated by deploying a new lottery and cutting over at a round boundary;
     * the old contract is never paused, so its historical rounds stay resolvable and claimable
     * forever. Round numbering is continuous across the two (the new lottery inherits the old
     * genesis), so rounds below the cutover live here and rounds at/after it live on `lottery`.
     *
     * Integrators only need this to read or claim PRE-migration rounds. New bets always go to
     * `lottery`. Absent when a deployment has never been migrated.
     */
    lotteryLegacy?: Address;
    /** Mined-SLVR vault, present from the round-33500 generation on. */
    minerVault?: Address;
    /** SlvrVoteEscrowStaking (the veNFT staker) */
    staking: Address;
    /** SlvrToken (ERC20) */
    token: Address;
    /** SlvrAutoCommitV2 (optional) */
    autoCommit?: Address;
    /** The PREVIOUS SlvrAutoCommitV2 after a migration — existing plans/balances live here until
     *  their owner moves them. Claims and withdrawals keep working against it. (optional) */
    autoCommitLegacy?: Address;
    /** SlvrClaimLockerV2 — the escrow's authorized on-behalf locker, and the contract the
     *  auto-commit routes its lock modes through (optional; post-migration) */
    claimLockerV2?: Address;
    /** SlvrVoteEscrow NFT — needed to approve/own the tokenIds you stake (optional) */
    voteEscrow?: Address;
    /** SLVR/ETH UniswapV2 pair — enables SLVR price reads via `sdk.price` (optional) */
    slvrEthPair?: Address;
    /**
     * Chainlink-style ETH/USD feed — enables USD prices via `sdk.ethUsd` (optional).
     * Absent on deployments (like Robinhood Chain) that have no on-chain feed.
     */
    chainlinkEthUsd?: Address;
    /** Multicall3 — lets the SDK batch multi-square reads into a single RPC call (optional). */
    multicall3?: Address;
    /** SlvrHub emission/sink router (optional; only on hub deployments) */
    hub?: Address;
    /** SlvrGameRegistry (optional; only on hub deployments) */
    registry?: Address;
    /** SlvrJackpot (optional; only on hub deployments) */
    jackpot?: Address;
    /** SlvrMultiClaim — batch-claim helper for the CURRENT lottery (optional) */
    multiClaim?: Address;
  };
  /**
   * The round at which `lottery` took over from `lotteryLegacy` (optional).
   *
   * Round numbering is continuous across a migration, so this is the single number that tells
   * you which contract owns a given round: `roundId < cutoverRound` => `lotteryLegacy`,
   * otherwise => `lottery`. Absent when a deployment has never been migrated.
   */
  cutoverRound?: number;
  /**
   * The full generation history, oldest first — the only thing that survives a SECOND cutover.
   *
   * `cutoverRound` + `lotteryLegacy` describe ONE migration, which is exactly enough to be wrong
   * after the next one: with three generations, `lotteryLegacy` is the middle contract, so a round
   * from the first generation resolves to a contract that never held it, and the claim is simply
   * not found. Prefer `lotteryForRound`, which walks this list. The two-generation fields are kept
   * so existing integrations keep working.
   */
  generations?: readonly SlvrGeneration[];
}

/**
 * Robinhood Chain mainnet — the canonical production Slvr deployment.
 *
 * Addresses populated from `DeployRobinhood.s.sol` (2026-07-09), then updated for the
 * round-12500 grid-game migration (2026-07-22): `lottery` is the gas-optimized generation and
 * `autoCommit` is SlvrAutoCommitV3. The previous generation stays reachable and fully
 * claimable via `lotteryLegacy` / `autoCommitLegacy`. See MIGRATING.md.
 *
 * The live deployment does not run the hub architecture, so `hub`/`registry`/`jackpot` are
 * intentionally absent.
 */
export const robinhood: SlvrDeployment = {
  chainId: 4663,
  name: 'Robinhood Chain',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  blockExplorer: 'https://robinhoodchain.blockscout.com/',
  // DON'T EDIT THIS BY HAND. This package is generated from the slvr-mono monorepo, where the
  // source of truth is subgraph/config/endpoint.json; `scripts/check-subgraph-endpoint.sh --fix`
  // rewrites this line and the interface's matching copy together, and CI fails if they disagree.
  // It stays a literal because this package is published and mirrored standalone, so it can't
  // import anything from outside its own tree.
  //
  // Worth keeping enforced: this once drifted to a dead 1.2.0 — the interface moved to 1.3.0 and
  // the SDK didn't — and that subgraph later stopped indexing, leaving consumers of this default
  // reading data ~4 days stale.
  subgraphUrl:
    'https://api.goldsky.com/api/public/project_cmre158qbffn101xe929tflsk/subgraphs/slvr-robinhood/1.8.0/gn',
  addresses: {
    // Grid-game migration at round 33500 (2026-08-13): the miner-vault generation. As with every
    // cutover, only the game-layer contracts changed — token, staking, vote escrow, the pair and
    // the price feeds are the same contracts they have always been. What is NEW this time is
    // where miner state lives: the vault below holds every wallet's unrefined SLVR, dividends
    // and refining clock, outside any one lottery, so this is the LAST cutover that moved them.
    lottery: '0xa1e5213505772B195FD7AE3b4a6b27B58Cf72A3D',
    lotteryLegacy: '0xB0Cc994Ce4E8fb106da9Eb36e26fDd8C5f1e0c71',
    staking: '0xaF68598eBd245DC3cB92FF16E9Ba1814DD137200',
    token: '0x791229E3EbD6CFdC3D8157f48722684173C29aD9',
    autoCommit: '0x34DD8699E4E9CB6bBA58e28F0233F6e23CeC0387',
    autoCommitLegacy: '0x5FD69EE67472495CDc0BE784898647782E073Ff5',
    claimLockerV2: '0x44B3D5b8D31251D49Ca4c88b6a82594947693A5C',
    multiClaim: '0x740A66fc9201962f39802d924D4C2347cdf823A1',
    // SlvrMinerVault: mined SLVR and its accounting, shared by every generation from round 33500
    // on. Deployed once, ever — this address outlives lotteries, and cashing out mined SLVR goes
    // through it (vault-era lotteries have no withdrawUnrefinedSlvr).
    minerVault: '0x2070b4B0c57EaF070CF86cD8321a6054f3D25260',
    voteEscrow: '0xd9b8FBD61033145c5496132153CE675756313B71',
    slvrEthPair: '0xe365b92239097Ed3322131411DbE15a5c4068eff',
    // Chainlink ETH/USD feed (standard AggregatorV3 proxy; "ETH / USD", 8 decimals).
    // Verified on-chain. There is also an SVR proxy at
    // 0x5058aDee53b04e374d8bEDbAD634Bc4778F50b22 with identical price data — that
    // one is for protocols integrating Chainlink SVR (OEV recapture); for plain
    // price reads the standard proxy below is the right choice.
    chainlinkEthUsd: '0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9',
    // Multicall3 at its canonical cross-chain address (verified deployed on Robinhood Chain).
    multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
  cutoverRound: 33500,
  // Oldest first. Append only: an old lottery is never paused, so its rounds stay claimable
  // forever and deleting an entry is the SDK losing its only route to money still owed.
  generations: [
    {
      label: 'Original',
      startRound: 0,
      lottery: '0x284Eb4016305Fa7FbC162Fb68F27227271001c7f',
      autoCommit: '0x314c8D5755468224AC60c36FB5494F0D7D5Abb3B',
      claimLocker: '0x2fD3BE762eb9d8eE293dD923D8809Dbd3D653dd7',
      multiClaim: '0x32783f1301147f6fb45c049a9546819655F81415',
    },
    {
      label: 'Gas-optimized',
      startRound: 12500,
      lottery: '0xB0Cc994Ce4E8fb106da9Eb36e26fDd8C5f1e0c71',
      autoCommit: '0x5FD69EE67472495CDc0BE784898647782E073Ff5',
      claimLocker: '0x83F84C5d431a986a1AB209F902B954b5D3550d8c',
      multiClaim: '0x9F34a8561f97E388D4A1589c1D046C61d6915323',
    },
    {
      label: 'Payload rollover',
      startRound: 33500,
      lottery: '0xa1e5213505772B195FD7AE3b4a6b27B58Cf72A3D',
      autoCommit: '0x34DD8699E4E9CB6bBA58e28F0233F6e23CeC0387',
      claimLocker: '0x44B3D5b8D31251D49Ca4c88b6a82594947693A5C',
      multiClaim: '0x740A66fc9201962f39802d924D4C2347cdf823A1',
    },
  ],
};

/**
 * All known Slvr deployments, keyed by a short network slug.
 *
 * @example
 * ```typescript
 * import { deployments } from '@slvr-labs/sdk';
 * const { addresses, rpcUrl } = deployments.robinhood;
 * ```
 */
export const deployments = {
  robinhood,
} as const;

/**
 * A ready-to-use viem `Chain` for Robinhood Chain mainnet, so you don't have to
 * hand-roll `defineChain`.
 *
 * @example
 * ```typescript
 * import { createPublicClient, http } from 'viem';
 * import { robinhoodChain } from '@slvr-labs/sdk';
 *
 * const publicClient = createPublicClient({ chain: robinhoodChain, transport: http() });
 * ```
 */
export const robinhoodChain = defineChain({
  id: robinhood.chainId,
  name: robinhood.name,
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: { default: { http: [robinhood.rpcUrl] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
  // Registering Multicall3 lets viem batch reads: the SDK's multi-square reads
  // become one RPC call, and clients created with `batch: { multicall: true }`
  // auto-batch every concurrent read.
  contracts: {
    multicall3: { address: robinhood.addresses.multicall3! },
  },
});

/**
 * Pick the lottery contract that owns a given round.
 *
 * Round numbering is continuous across a game migration — the new lottery inherits the old
 * genesis timestamp — so a round id alone does not tell you which contract holds it. Below
 * `cutoverRound` the round lives on the previous generation and is read and claimed there;
 * at or above it, on the current one. Both remain live: the old contract is never paused, so
 * its rounds stay resolvable and claimable with no deadline.
 *
 * Returns `addresses.lottery` for deployments that have never migrated.
 *
 * @example
 * ```typescript
 * import { deployments, lotteryForRound } from '@slvr-labs/sdk';
 *
 * const address = lotteryForRound(deployments.robinhood, 12_499); // previous generation
 * ```
 */
export function lotteryForRound(deployment: SlvrDeployment, roundId: number | bigint): Address {
  const { addresses, cutoverRound, generations } = deployment;

  // Walk the full history when it is there. The LAST generation whose startRound the round has
  // reached owns it — scanning rather than taking the first match matters once more than one
  // cutover is behind us, which is the case this exists for.
  if (generations?.length) {
    const round = BigInt(roundId);
    let owner: SlvrGeneration | undefined;
    for (const g of generations) if (round >= BigInt(g.startRound)) owner = g;
    // Below the first generation's startRound there is no owner: fall back to the oldest, which
    // is the contract that genesis rounds live on.
    return (owner ?? generations[0]!).lottery;
  }

  if (cutoverRound == null || !addresses.lotteryLegacy) return addresses.lottery;
  return BigInt(roundId) < BigInt(cutoverRound) ? addresses.lotteryLegacy : addresses.lottery;
}

/**
 * Whether the migration to `addresses.lottery` has actually happened yet, given the round the
 * chain is on right now.
 *
 * Exists because a published package is a fixed artifact but the cutover is an event: between
 * the release and the round, `addresses.lottery` names a contract that is deployed but not yet
 * live — it accepts bets while minting no SLVR and holding no jackpot. Integrators who ship
 * ahead of a cutover should gate on this rather than assume the package they installed is
 * already correct.
 *
 * Pass the current round from `sdk.lottery.currentRoundId()`.
 *
 * @example
 * ```typescript
 * const current = await sdk.lottery.currentRoundId();
 * const live = isMigrationLive(deployments.robinhood, current);
 * const bettingAddress = live ? addresses.lottery : addresses.lotteryLegacy ?? addresses.lottery;
 * ```
 */
export function isMigrationLive(deployment: SlvrDeployment, currentRoundId: number | bigint): boolean {
  const { cutoverRound } = deployment;
  if (cutoverRound == null) return true; // never migrated: the only lottery is the live one
  return BigInt(currentRoundId) >= BigInt(cutoverRound);
}
