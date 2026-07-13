/**
 * Contract addresses and chain config used by the examples.
 *
 * These default to the canonical Robinhood Chain mainnet deployment that ships
 * with the SDK (`deployments.robinhood`). Point them at your own deployment by
 * editing the values below, or import `deployments` / `robinhoodChain` directly
 * from `@slvr-labs/sdk` in your own code.
 */

import { Address } from 'viem';
import { deployments, robinhoodChain } from '../src';

const { addresses } = deployments.robinhood;

/**
 * Contract addresses on Robinhood Chain.
 */
export const CONTRACTS = {
  /** SlvrGridLottery contract address */
  LOTTERY: addresses.lottery as Address,

  /** SlvrVoteEscrowStaking (veNFT staker) contract address */
  STAKING: addresses.staking as Address,

  /** SlvrToken contract address */
  TOKEN: addresses.token as Address,

  /** SlvrAutoCommitV2 contract address (optional) */
  AUTO_COMMIT: (addresses.autoCommit ?? '0x...') as Address,
} as const;

/**
 * Robinhood Chain configuration (a ready-made viem chain).
 */
export const ROBINHOOD_CHAIN = robinhoodChain;
