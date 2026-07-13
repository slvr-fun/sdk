import { Address, isAddress, getAddress } from 'viem';
import { ValidationError } from './errors';

/**
 * Validate and normalize an Ethereum address
 * @param address Address to validate
 * @param fieldName Field name for error message
 * @returns Checksummed address
 * @throws ValidationError if address is invalid
 */
export function validateAddress(address: string, fieldName: string = 'address'): Address {
  if (!isAddress(address)) {
    throw new ValidationError(`Invalid ${fieldName}: ${address}`, fieldName);
  }
  return getAddress(address);
}

/**
 * Validate that an amount is positive
 * @param amount Amount to validate
 * @param fieldName Field name for error message
 * @throws ValidationError if amount is invalid
 */
export function validateAmount(amount: bigint, fieldName: string = 'amount'): void {
  if (amount < 0n) {
    throw new ValidationError(`${fieldName} must be non-negative`, fieldName);
  }
  if (amount === 0n) {
    throw new ValidationError(`${fieldName} must be greater than zero`, fieldName);
  }
}

/**
 * Validate square indices are within valid range
 * @param squares Array of square indices
 * @param gridSize Grid size (default 25)
 * @throws ValidationError if squares are invalid
 */
export function validateSquares(squares: number[], gridSize: number = 25): void {
  if (squares.length === 0) {
    throw new ValidationError('At least one square must be provided', 'squares');
  }
  
  for (const square of squares) {
    if (!Number.isInteger(square) || square < 0 || square >= gridSize) {
      throw new ValidationError(
        `Invalid square index: ${square}. Must be between 0 and ${gridSize - 1}`,
        'squares'
      );
    }
  }
}

/**
 * Validate that arrays have matching lengths
 * @param arrays Arrays to validate
 * @param fieldNames Field names for error message
 * @throws ValidationError if arrays don't match
 */
export function validateArrayLengths(arrays: unknown[][], fieldNames: string[]): void {
  if (arrays.length < 2) {
    return;
  }
  
  const firstLength = arrays[0]?.length ?? 0;
  for (let i = 1; i < arrays.length; i++) {
    const currentArray = arrays[i];
    const currentFieldName = fieldNames[i];
    if (!currentArray || currentArray.length !== firstLength) {
      throw new ValidationError(
        `Array length mismatch: ${fieldNames[0]} has ${firstLength} items, but ${currentFieldName ?? `array ${i}`} has ${currentArray?.length ?? 0} items`,
        currentFieldName
      );
    }
  }
}

/**
 * Validate basis points (0-10000)
 * @param bps Basis points value
 * @param fieldName Field name for error message
 * @throws ValidationError if bps is invalid
 */
export function validateBps(bps: number, fieldName: string = 'bps'): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new ValidationError(
      `${fieldName} must be an integer between 0 and 10000 (got ${bps})`,
      fieldName
    );
  }
}

/**
 * Validate that basis points array sums to 10000
 * @param bpsArray Array of basis points
 * @param fieldName Field name for error message
 * @throws ValidationError if bps don't sum to 10000
 */
export function validateBpsSum(bpsArray: number[], fieldName: string = 'bpsAlloc'): void {
  const sum = bpsArray.reduce((acc, bps) => acc + bps, 0);
  if (sum !== 10000) {
    throw new ValidationError(
      `${fieldName} must sum to 10000 (got ${sum})`,
      fieldName
    );
  }
}

/**
 * Wait for transaction receipt with timeout
 * @param publicClient Public client
 * @param hash Transaction hash
 * @param timeout Timeout in milliseconds (default 120000 = 2 minutes)
 * @returns Transaction receipt
 */
export async function waitForTransactionReceipt(
  publicClient: { waitForTransactionReceipt?: (args: { hash: `0x${string}`; timeout?: number }) => Promise<unknown> },
  hash: `0x${string}`,
  timeout: number = 120000
): Promise<unknown> {
  if (!publicClient.waitForTransactionReceipt) {
    throw new Error('Public client does not support waitForTransactionReceipt');
  }
  return await publicClient.waitForTransactionReceipt({ hash, timeout });
}
