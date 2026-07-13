/**
 * Custom error classes for the Slvr SDK
 */

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
