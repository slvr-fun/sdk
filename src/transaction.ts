import { PublicClient, WalletClient, Address } from 'viem';
import { TransactionError } from './errors';

/**
 * Options for transaction execution
 */
export interface TransactionOptions {
  /** Maximum gas to use */
  gas?: bigint;
  /** Gas price (legacy) */
  gasPrice?: bigint;
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: bigint;
  /** Whether to wait for transaction receipt */
  waitForReceipt?: boolean;
  /** Timeout for waiting for receipt (milliseconds) */
  receiptTimeout?: number;
}

/**
 * Estimate gas for a contract write operation
 * @param publicClient Public client
 * @param address Contract address
 * @param abi Contract ABI
 * @param functionName Function name
 * @param args Function arguments
 * @param value Optional value to send
 * @param account Optional account address
 * @returns Estimated gas
 */
export async function estimateGas(
  publicClient: PublicClient,
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args: unknown[],
  value?: bigint,
  account?: Address
): Promise<bigint> {
  try {
    const estimateParams: any = {
      address,
      abi,
      functionName,
      args,
    };
    if (value !== undefined) {
      estimateParams.value = value;
    }
    if (account !== undefined) {
      estimateParams.account = account;
    }
    const gas = await publicClient.estimateContractGas(estimateParams);
    return gas;
  } catch (error) {
    throw new TransactionError(
      `Failed to estimate gas for ${functionName}: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      error
    );
  }
}

/**
 * Wait for transaction receipt with error handling
 * @param publicClient Public client
 * @param hash Transaction hash
 * @param timeout Timeout in milliseconds
 * @returns Transaction receipt
 * @throws TransactionError if transaction fails or times out
 */
export async function waitForReceipt(
  publicClient: PublicClient,
  hash: `0x${string}`,
  timeout: number = 120000
): Promise<unknown> {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout,
    });

    // Check if transaction failed
    if (receipt && typeof receipt === 'object' && 'status' in receipt) {
      if (receipt.status === 'reverted') {
        throw new TransactionError(
          `Transaction reverted: ${hash}`,
          hash
        );
      }
    }

    return receipt;
  } catch (error) {
    if (error instanceof TransactionError) {
      throw error;
    }
    throw new TransactionError(
      `Failed to wait for transaction receipt: ${error instanceof Error ? error.message : String(error)}`,
      hash,
      error
    );
  }
}

/**
 * Execute a contract write with options
 * @param walletClient Wallet client
 * @param publicClient Public client
 * @param address Contract address
 * @param abi Contract ABI
 * @param functionName Function name
 * @param args Function arguments
 * @param options Transaction options
 * @returns Transaction hash or receipt
 */
export async function executeTransaction(
  walletClient: WalletClient,
  publicClient: PublicClient,
  address: Address,
  abi: readonly unknown[],
  functionName: string,
  args: unknown[],
  options: TransactionOptions & { value?: bigint } = {}
): Promise<`0x${string}` | unknown> {
  const {
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
    waitForReceipt: waitForReceipt_,
    receiptTimeout,
    value,
  } = options;

  const writeParams = {
    address,
    abi,
    functionName,
    args,
    account: walletClient.account!,
    chain: null,
    ...(value !== undefined && { value }),
    ...(gas !== undefined && { gas }),
    ...(gasPrice !== undefined && { gasPrice }),
    ...(maxFeePerGas !== undefined && { maxFeePerGas }),
    ...(maxPriorityFeePerGas !== undefined && { maxPriorityFeePerGas }),
  } as Parameters<typeof walletClient.writeContract>[0];

  try {
    const hash = await walletClient.writeContract(writeParams);

    if (waitForReceipt_) {
      return await waitForReceipt(publicClient, hash, receiptTimeout);
    }

    return hash;
  } catch (error) {
    throw new TransactionError(
      `Failed to execute transaction: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      error
    );
  }
}
