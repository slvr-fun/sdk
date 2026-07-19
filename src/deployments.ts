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
    /** SlvrGridLottery */
    lottery: Address;
    /** SlvrVoteEscrowStaking (the veNFT staker) */
    staking: Address;
    /** SlvrToken (ERC20) */
    token: Address;
    /** SlvrAutoCommitV2 (optional) */
    autoCommit?: Address;
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
  };
}

/**
 * Robinhood Chain mainnet — the canonical production Slvr deployment.
 *
 * Addresses populated from `DeployRobinhood.s.sol` (2026-07-09); `autoCommit`
 * is SlvrAutoCommitV2. The live deployment does not run the hub architecture,
 * so `hub`/`registry`/`jackpot` are intentionally absent.
 */
export const robinhood: SlvrDeployment = {
  chainId: 4663,
  name: 'Robinhood Chain',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  blockExplorer: 'https://robinhoodchain.blockscout.com/',
  // Keep in step with `subgraphUrl` in interface/config/constants.ts — this drifted to a dead
  // 1.2.0 (stopped indexing ~4 days back) because the interface moved to 1.3.0 and the SDK didn't.
  subgraphUrl:
    'https://api.goldsky.com/api/public/project_cmre158qbffn101xe929tflsk/subgraphs/slvr-robinhood/1.4.0/gn',
  addresses: {
    lottery: '0x284Eb4016305Fa7FbC162Fb68F27227271001c7f',
    staking: '0xaF68598eBd245DC3cB92FF16E9Ba1814DD137200',
    token: '0x791229E3EbD6CFdC3D8157f48722684173C29aD9',
    autoCommit: '0x314c8D5755468224AC60c36FB5494F0D7D5Abb3B',
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
