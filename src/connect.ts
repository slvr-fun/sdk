import {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SlvrDeployment, robinhood, robinhoodChain } from './deployments';

/**
 * Options for {@link createSlvrClients} / {@link SlvrSDK.connect}.
 */
export interface ConnectOptions {
  /** Which deployment to target. Defaults to `robinhood`. */
  deployment?: SlvrDeployment;
  /** RPC URL. Defaults to the deployment's `rpcUrl`. Ignored if `transport` is given. */
  rpcUrl?: string;
  /** A fully-custom viem transport (overrides `rpcUrl`). */
  transport?: Transport;
  /** A private key to build a wallet client from (for sending transactions). */
  privateKey?: `0x${string}`;
  /** …or an already-built viem `Account` (alternative to `privateKey`). */
  account?: Account;
  /** Auto-batch concurrent reads through Multicall3. Defaults to `true`. */
  batchMulticall?: boolean;
  /** viem polling interval (ms) used by event watchers. */
  pollingInterval?: number;
}

/**
 * Build a viem `Chain` for a deployment. Returns the shipped `robinhoodChain`
 * (which already registers Multicall3) for the Robinhood deployment; otherwise
 * synthesizes one, wiring `multicall3` when the deployment provides it.
 */
export function chainFromDeployment(deployment: SlvrDeployment): Chain {
  if (deployment.chainId === robinhood.chainId) return robinhoodChain;
  return defineChain({
    id: deployment.chainId,
    name: deployment.name,
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrls: { default: { http: [deployment.rpcUrl] } },
    ...(deployment.blockExplorer
      ? { blockExplorers: { default: { name: 'Explorer', url: deployment.blockExplorer } } }
      : {}),
    ...(deployment.addresses.multicall3
      ? { contracts: { multicall3: { address: deployment.addresses.multicall3 } } }
      : {}),
  });
}

/** Clients returned by {@link createSlvrClients}. */
export interface SlvrClients {
  chain: Chain;
  publicClient: PublicClient;
  /** Present only when a `privateKey` or `account` was supplied. */
  walletClient?: WalletClient;
}

/**
 * Create ready-to-use viem clients for a Slvr deployment with sensible, resilient
 * defaults — Multicall3 auto-batching, a longer timeout, and retries — so you
 * don't have to hand-tune the transport for a polling bot.
 *
 * @example
 * ```typescript
 * import { createSlvrClients } from '@slvr-labs/sdk';
 * const { publicClient, walletClient } = createSlvrClients({ privateKey: process.env.PRIVATE_KEY });
 * ```
 */
export function createSlvrClients(opts: ConnectOptions = {}): SlvrClients {
  const deployment = opts.deployment ?? robinhood;
  const chain = chainFromDeployment(deployment);
  const transport = opts.transport ?? http(opts.rpcUrl ?? deployment.rpcUrl, { timeout: 20_000, retryCount: 3 });

  const publicClient = createPublicClient({
    chain,
    transport,
    batch: { multicall: opts.batchMulticall ?? true },
    ...(opts.pollingInterval ? { pollingInterval: opts.pollingInterval } : {}),
  }) as PublicClient;

  const account = opts.account ?? (opts.privateKey ? privateKeyToAccount(opts.privateKey) : undefined);
  const walletClient = account
    ? (createWalletClient({ chain, transport, account }) as WalletClient)
    : undefined;

  return { chain, publicClient, walletClient };
}
