import { Address, parseAbi, PublicClient, WalletClient } from 'viem';
import { AutoCommitPlan } from '../types';
import { WalletClientRequiredError, ContractCallError } from '../errors';
import { validateAddress, validateAmount, validateSquares, validateBpsSum, validateArrayLengths } from '../utils';

/**
 * SlvrAutoCommitV2 contract interface
 *
 * V2 economics: executors calling executeFor/claimFor are reimbursed their
 * metered gas (plus a premium, capped at maxFeePerExecution — both owner-tunable
 * within hard ceilings) from the user's plan balance — there is no flat
 * AUTOMATION_FEE and the execution functions are nonpayable. Claimable winning
 * rounds are discovered off-chain and passed in explicitly via claimRounds.
 */
export class SlvrAutoCommit {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private address: Address;

  private static readonly ABI = parseAbi([
    // View functions
    'function planInfo(address user) view returns (bool enabled, uint256 nextRoundId, uint32 playsRemaining, uint256 amountPerPlay, uint256 balance, bool autoClaim, uint8[] squares, uint16[] bpsAlloc, uint256 planStartRoundId)',
    'function needsExecution(address user) view returns (bool ready, string reason)',
    'function executedRounds(address user, uint256 roundId) view returns (bool)',
    'function LOTTERY() view returns (address)',
    'function UNLIMITED_PLAYS() view returns (uint32)',
    'function MAX_PLAYS_PER_EXECUTION() view returns (uint32)',
    'function MAX_CLAIMS_PER_EXECUTION() view returns (uint256)',
    'function maxFeePerExecution() view returns (uint256)',
    'function feePremiumBps() view returns (uint16)',

    // Write functions
    'function deposit() payable',
    'function withdraw(uint256 amount, address to)',
    'function configurePlan(uint32 plays, uint256 amountPerPlay, uint8[] squares, uint16[] bpsAlloc, bool autoClaim)',
    'function configurePlanAndDeposit(uint32 plays, uint256 amountPerPlay, uint8[] squares, uint16[] bpsAlloc, bool autoClaim) payable',
    'function disablePlan()',
    'function cancelPlan()',
    'function executeFor(address user, uint32 maxPlays, uint256[] claimRounds)',
    'function claimFor(address user, uint256[] claimRounds) returns (uint256 claimed)',
  ]);

  constructor(publicClient: PublicClient, walletClient: WalletClient | undefined, address: Address) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.address = address;
  }

  /**
   * Update the wallet client
   * @param walletClient New wallet client
   */
  setWalletClient(walletClient: WalletClient | undefined): void {
    this.walletClient = walletClient;
  }

  /**
   * Get plan information for a user
   */
  async planInfo(user: Address): Promise<AutoCommitPlan> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'planInfo',
      args: [user],
    });

    return {
      enabled: result[0],
      nextRoundId: result[1],
      playsRemaining: Number(result[2]),
      amountPerPlay: result[3],
      balance: result[4],
      autoClaim: result[5],
      squares: (result[6] as unknown as readonly bigint[]).map((s: bigint) => Number(s)),
      bpsAlloc: (result[7] as unknown as readonly bigint[]).map((b: bigint) => Number(b)),
      planStartRoundId: result[8],
    };
  }

  /**
   * Check whether a plan is ready to execute, and if not, why
   */
  async needsExecution(user: Address): Promise<{ ready: boolean; reason: string }> {
    const [ready, reason] = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'needsExecution',
      args: [user],
    });
    return { ready, reason };
  }

  /**
   * Check whether a specific round has already been executed for a user
   */
  async executedRound(user: Address, roundId: bigint): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'executedRounds',
      args: [user, roundId],
    });
  }

  /**
   * Get lottery contract address
   */
  async lottery(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'LOTTERY',
    });
  }

  /**
   * Get the sentinel plays value meaning "unlimited plays"
   */
  async unlimitedPlays(): Promise<number> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'UNLIMITED_PLAYS',
    });
  }

  /**
   * Get max plays per execution
   */
  async maxPlaysPerExecution(): Promise<number> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'MAX_PLAYS_PER_EXECUTION',
    });
  }

  /**
   * Get max claim rounds accepted per execution
   */
  async maxClaimsPerExecution(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'MAX_CLAIMS_PER_EXECUTION',
    });
  }

  /**
   * Get the current cap on the executor fee reimbursed per execution
   * (owner-tunable within the contract's hard ceiling)
   */
  async maxFeePerExecution(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'maxFeePerExecution',
    });
  }

  /**
   * Get the current executor-fee premium in basis points
   * (owner-tunable within the contract's hard ceiling)
   */
  async feePremiumBps(): Promise<number> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrAutoCommit.ABI,
      functionName: 'feePremiumBps',
    });
  }

  /**
   * Deposit native tokens to auto-commit plan
   * @param value Amount to deposit
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if amount is invalid
   * @throws ContractCallError if contract call fails
   */
  async deposit(value: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('depositing');
    }

    validateAmount(value, 'deposit amount');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'deposit',
        value,
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to deposit: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Withdraw from auto-commit plan
   * @param amount Amount to withdraw
   * @param to Recipient address
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async withdraw(amount: bigint, to: Address): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('withdrawing');
    }

    validateAmount(amount, 'withdraw amount');
    const recipient = validateAddress(to, 'recipient');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'withdraw',
        args: [amount, recipient],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Configure auto-commit plan
   * @param plays Number of plays (UNLIMITED_PLAYS = 4294967295 for unlimited;
   *              forced to unlimited on-chain when autoClaim is true)
   * @param amountPerPlay Amount per play
   * @param squares Square indices to bet on
   * @param bpsAlloc Basis points allocation for each square (must sum to 10000)
   * @param autoClaim Whether the keeper should claim winnings back into the plan balance
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async configurePlan(
    plays: number,
    amountPerPlay: bigint,
    squares: number[],
    bpsAlloc: number[],
    autoClaim: boolean
  ): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('configuring plan');
    }

    this.validatePlanConfig(plays, amountPerPlay, squares, bpsAlloc);

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'configurePlan',
        args: [plays, amountPerPlay, squares, bpsAlloc, autoClaim],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to configure plan: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Configure auto-commit plan and deposit funds in a single transaction
   * @param plays Number of plays (see configurePlan)
   * @param amountPerPlay Amount per play
   * @param squares Square indices to bet on
   * @param bpsAlloc Basis points allocation for each square (must sum to 10000)
   * @param autoClaim Whether the keeper should claim winnings back into the plan balance
   * @param value Amount to deposit
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async configurePlanAndDeposit(
    plays: number,
    amountPerPlay: bigint,
    squares: number[],
    bpsAlloc: number[],
    autoClaim: boolean,
    value: bigint
  ): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('configuring plan');
    }

    this.validatePlanConfig(plays, amountPerPlay, squares, bpsAlloc);
    validateAmount(value, 'deposit amount');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'configurePlanAndDeposit',
        args: [plays, amountPerPlay, squares, bpsAlloc, autoClaim],
        value,
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to configure plan: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Disable auto-commit plan
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ContractCallError if contract call fails
   */
  async disablePlan(): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('disabling plan');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'disablePlan',
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to disable plan: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Cancel the plan and refund the entire remaining balance to the caller
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ContractCallError if contract call fails
   */
  async cancelPlan(): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('cancelling plan');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'cancelPlan',
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to cancel plan: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Execute auto-commit plan for a user (anyone can call).
   * The caller is reimbursed metered gas + premium from the user's plan balance.
   * @param user User address
   * @param maxPlays Maximum number of plays to execute
   * @param claimRounds Winning round ids to claim into the plan balance before
   *        betting (discovered off-chain; non-claimable entries are no-ops)
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async executeFor(user: Address, maxPlays: number, claimRounds: bigint[] = []): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('executing plan');
    }

    const userAddress = validateAddress(user, 'user');
    if (!Number.isInteger(maxPlays) || maxPlays <= 0) {
      throw new ContractCallError('maxPlays must be a positive integer');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'executeFor',
        args: [userAddress, maxPlays, claimRounds],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to execute plan: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Claim winning rounds into a user's plan balance without betting (anyone can
   * call). Useful when the plan balance is too low to bet until winnings land.
   * @param user User address
   * @param claimRounds Winning round ids to claim (discovered off-chain)
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async claimFor(user: Address, claimRounds: bigint[]): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('claiming');
    }

    const userAddress = validateAddress(user, 'user');
    if (claimRounds.length === 0) {
      throw new ContractCallError('claimRounds must not be empty');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrAutoCommit.ABI,
        functionName: 'claimFor',
        args: [userAddress, claimRounds],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to claim: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  private validatePlanConfig(plays: number, amountPerPlay: bigint, squares: number[], bpsAlloc: number[]): void {
    if (!Number.isInteger(plays) || plays <= 0) {
      throw new ContractCallError('Plays must be a positive integer');
    }
    validateAmount(amountPerPlay, 'amountPerPlay');
    validateSquares(squares);
    validateArrayLengths([squares, bpsAlloc], ['squares', 'bpsAlloc']);
    validateBpsSum(bpsAlloc, 'bpsAlloc');
  }
}
