import { describe, it, expect } from 'vitest';
import { createSlvrClients, chainFromDeployment, deployments, robinhoodChain, SlvrSDK } from '../src';

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

describe('deployments + chain', () => {
  it('robinhoodChain registers Multicall3', () => {
    expect(robinhoodChain.id).toBe(4663);
    expect(robinhoodChain.contracts?.multicall3?.address?.toLowerCase()).toBe(MULTICALL3.toLowerCase());
  });

  it('robinhood addresses include the pieces the SDK needs', () => {
    const a = deployments.robinhood.addresses;
    for (const key of ['lottery', 'staking', 'token', 'slvrEthPair', 'chainlinkEthUsd', 'multicall3'] as const) {
      expect(a[key], key).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});

describe('chainFromDeployment', () => {
  it('returns the shipped robinhoodChain for the robinhood deployment', () => {
    expect(chainFromDeployment(deployments.robinhood)).toBe(robinhoodChain);
  });

  it('wires multicall3 for a custom deployment that provides it', () => {
    const chain = chainFromDeployment({
      chainId: 31337,
      name: 'Local',
      rpcUrl: 'http://127.0.0.1:8545',
      addresses: { lottery: '0x' + '1'.repeat(40), staking: '0x' + '2'.repeat(40), token: '0x' + '3'.repeat(40), multicall3: MULTICALL3 },
    } as never);
    expect(chain.id).toBe(31337);
    expect(chain.contracts?.multicall3?.address).toBe(MULTICALL3);
  });
});

describe('createSlvrClients', () => {
  it('builds a read-only public client with multicall batching by default', () => {
    const { publicClient, walletClient, chain } = createSlvrClients();
    expect(chain.id).toBe(4663);
    expect(publicClient.chain?.id).toBe(4663);
    expect(walletClient).toBeUndefined();
    expect((publicClient as { batch?: { multicall?: unknown } }).batch?.multicall).toBeTruthy();
  });

  it('builds a wallet client from a private key', () => {
    // Well-known anvil dev key #0 — not a real account with funds.
    const pk = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const { walletClient } = createSlvrClients({ privateKey: pk });
    expect(walletClient?.account?.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });
});

describe('SlvrSDK.connect', () => {
  it('returns a read-only SDK wired to the robinhood lottery', () => {
    const sdk = SlvrSDK.connect();
    expect(sdk.getWalletClient()).toBeUndefined();
    expect(sdk.price).toBeDefined(); // slvrEthPair configured
    expect(sdk.ethUsd).toBeDefined(); // chainlinkEthUsd configured
  });
});
