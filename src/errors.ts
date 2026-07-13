/**
 * Custom error classes for the Slvr SDK
 */
import { BaseError, ContractFunctionRevertedError } from 'viem';

/**
 * Base error class for all SDK errors
 */
export class SlvrSDKError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'SlvrSDKError';
    Object.setPrototypeOf(this, SlvrSDKError.prototype);
  }
}

/**
 * Error thrown when wallet client is required but not provided
 */
export class WalletClientRequiredError extends SlvrSDKError {
  constructor(operation: string) {
    super(`Wallet client required for ${operation}`, 'WALLET_CLIENT_REQUIRED');
    this.name = 'WalletClientRequiredError';
    Object.setPrototypeOf(this, WalletClientRequiredError.prototype);
  }
}

/**
 * Error thrown when contract call fails
 */
export class ContractCallError extends SlvrSDKError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message, 'CONTRACT_CALL_ERROR');
    this.name = 'ContractCallError';
    Object.setPrototypeOf(this, ContractCallError.prototype);
  }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends SlvrSDKError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when transaction fails
 */
export class TransactionError extends SlvrSDKError {
  constructor(
    message: string,
    public readonly txHash?: `0x${string}`,
    public readonly cause?: unknown
  ) {
    super(message, 'TRANSACTION_ERROR');
    this.name = 'TransactionError';
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

/** Plain-English hints for the protocol's custom revert errors. */
const REVERT_HINTS: Record<string, string> = {
  InsufficientValue: 'msg.value did not cover the bet total (+ the one-time account-opening deposit for a new account).',
  RoundNotOpen: 'betting is closed for this round.',
  NotResolved: 'the round is not resolved yet.',
  ResolveRequested: 'the round is already being resolved; betting is closed.',
  BadClaim: 'nothing to claim — no winning bet on this round, or already claimed.',
  NoAccount: 'no miner account for this address yet (place a bet first to open one).',
  BadAmount: 'a zero or invalid amount.',
  BadSquare: 'a square index outside 0–24.',
  DupSquare: 'the same square appears twice in one bet.',
  BadArrays: 'squares and amounts arrays have mismatched lengths.',
  ValueNotSum: 'msg.value does not equal the sum of the bet amounts.',
  MustSumTo100Percent: 'allocation percentages must sum to 100%.',
  NotAuthorized: 'caller is not authorized (not the user or an approved delegate).',
  NotCurrentRound: 'that round is not the current one.',
  CannotDelegateToSelf: 'you cannot delegate to your own address.',
  RandomnessNotSettled: 'randomness for this round has not settled yet.',
  TransferFailed: 'an ETH/token transfer failed.',
  JackpotNotSet: 'no jackpot is configured for this round.',
};

/**
 * A decoded on-chain revert. `errorName` is the protocol's custom error (e.g.
 * `InsufficientValue`) when it could be decoded from the ABI.
 */
export class SlvrRevertError extends SlvrSDKError {
  constructor(
    public readonly errorName: string | undefined,
    message: string,
    public readonly args?: readonly unknown[],
    public readonly cause?: unknown
  ) {
    super(message, 'CONTRACT_REVERT');
    this.name = 'SlvrRevertError';
    Object.setPrototypeOf(this, SlvrRevertError.prototype);
  }
}

/**
 * Decode a viem contract error into a {@link SlvrRevertError} with the protocol's
 * custom error name and a plain-English hint. Returns `null` if `err` isn't a
 * decodable contract revert (so you can rethrow the original). Useful around
 * `simulateBet`, reads, or any caught write error.
 *
 * @example
 * ```typescript
 * try { await sdk.lottery.simulateBet(params); }
 * catch (e) { const r = decodeSlvrRevert(e); if (r) console.log(r.errorName, r.message); }
 * ```
 */
export function decodeSlvrRevert(err: unknown): SlvrRevertError | null {
  if (!(err instanceof BaseError)) return null;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as
    | ContractFunctionRevertedError
    | undefined;
  if (!revert) return null;
  const data = (revert as unknown as { data?: { errorName?: string; args?: readonly unknown[] } }).data;
  const name = data?.errorName;
  const hint = name ? REVERT_HINTS[name] : undefined;
  const message = name
    ? `Reverted: ${name}${hint ? ` — ${hint}` : ''}`
    : revert.shortMessage || err.shortMessage || 'contract reverted';
  return new SlvrRevertError(name, message, data?.args, err);
}
