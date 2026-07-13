import { Address, parseAbi, PublicClient, WalletClient } from 'viem';
import { RoundInfo, MinerState, BetParams, ClaimParams, ClaimParamsAdvanced } from '../types';
import { WalletClientRequiredError, ContractCallError } from '../errors';
import { validateAddress, validateAmount, validateSquares, validateArrayLengths, waitForTransactionReceipt } from '../utils';
import { SlvrGridLotteryEvents, BetPlacedEvent, RoundResolvedEvent } from '../events';

/**
 * SlvrGridLottery contract interface
 */
export class SlvrGridLottery {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private address: Address;

  // ABI for SlvrGridLottery contract
  private static readonly ABI = parseAbi([
    // View functions
    'function currentRoundId() view returns (uint256)',
    'function roundStart(uint256 roundId) view returns (uint256)',
    'function roundEnd(uint256 roundId) view returns (uint256)',
    'function roundOpen(uint256 roundId) view returns (bool)',
    // Betting cutoff for a round. This is the timestamp bets stop being accepted,
    // which can be earlier than roundEnd() — gate bots on this, not roundEnd.
    'function bettingEnd(uint256 roundId) view returns (uint256)',
    'function getExpectedReward(address account, uint256 roundId) view returns (uint256)',
    'function latestResolvedRoundId() view returns (uint256)',
    // getRound returns a flat 16-value tuple (no wrapping struct)
    'function getRound(uint256 roundId) view returns (uint64 requestedAt, bool resolved, bytes32 randomnessId, uint256 randomnessValue, uint8 winningSquare, bool jackpotHit, bool singleMinerRound, address singleMinerWinner, uint256 totalWager, uint256 fee, uint256 winnerTotal, uint256 potForWinners, uint256 slvrForWinners, uint256 payoutMulWad, uint256 slvrMulWad, uint256 totalUnclaimedSlvr)',
    'function getTotalOnSquare(uint256 roundId, uint8 square) view returns (uint256)',
    'function getBettorsOnSquare(uint256 roundId, uint8 square) view returns (uint256)',
    'function getUserBet(uint256 roundId, uint8 square, address bettor) view returns (uint256)',
    'function getHasClaimed(uint256 roundId, address user) view returns (bool)',
    'function getMinerState(address account) view returns (uint256 rewardsSlvr, uint256 refinedAccrued, uint256 indexSnapshot, bool hasAccount)',
    'function getHasAccount(address account) view returns (bool)',
    'function getDelegate(address user, address delegate) view returns (bool)',
    'function carryWinnerNativePool() view returns (uint256)',
    'function carryStakerNativeOwed() view returns (uint256)',
    'function carryJackpotNativeOwed() view returns (uint256)',
    'function carrySlvrPool() view returns (uint256)',
    // NOTE: slvrPerRound() still exists as a public var but is NO LONGER the authoritative
    // emission number. Emission is hub-gated (see SlvrHub.pendingEmission / mintReward), so the
    // amount actually minted per round is bounded by the game's streamed emission budget.
    'function slvrPerRound() view returns (uint256)',
    'function protocolFeeBps() view returns (uint16)',
    'function GRID() view returns (uint8)',
    'function ACCOUNT_DEPOSIT() view returns (uint256)',

    // Write functions
    'function bet(uint256 roundId, uint8[] squares, uint256[] amounts) payable',
    'function betFor(uint256 roundId, address beneficiary, uint8[] squares, uint256[] amounts) payable',
    'function claim(uint256 roundId)',
    'function claimAdvanced((address user, uint256 roundId, address recipientNative, address recipientSlvr, bool bypassFee, bool ethOnly) params)',
    'function approveDelegate(address delegate)',
    'function revokeDelegate(address delegate)',
    'function donateSlvrToJackpot(uint256 amount)',
    'function addEthToJackpot() payable',
    'function checkpoint(address account)',
    'function withdrawUnrefinedSlvr() returns (uint256 totalPayout, uint256 refiningFee)',
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
   * Get the current round ID
   */
  async currentRoundId(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'currentRoundId',
    }) as bigint;
  }

  /**
   * Get round start time
   */
  async roundStart(roundId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'roundStart',
      args: [roundId],
    }) as bigint;
  }

  /**
   * Get round end time
   */
  async roundEnd(roundId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'roundEnd',
      args: [roundId],
    }) as bigint;
  }

  /**
   * Check if round is open for betting
   */
  async roundOpen(roundId: bigint): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'roundOpen',
      args: [roundId],
    }) as boolean;
  }

  /**
   * Get the betting cutoff timestamp (unix seconds) for a round.
   *
   * Bets are only accepted until this time, which can be earlier than
   * {@link roundEnd}. Bots deciding whether they can still bet should gate on
   * this rather than on `roundEnd`.
   */
  async bettingEnd(roundId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'bettingEnd',
      args: [roundId],
    }) as bigint;
  }

  /**
   * Estimate the reward an account would receive for a round, in wei.
   *
   * Thin pass-through to the contract's `getExpectedReward`. Useful for sizing
   * bets or deciding whether a claim is worth the gas.
   */
  async getExpectedReward(account: Address, roundId: bigint): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getExpectedReward',
      args: [account, roundId],
    }) as bigint;
  }

  /**
   * Get the latest resolved round ID (type(uint256).max sentinel when none resolved yet)
   */
  async latestResolvedRoundId(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'latestResolvedRoundId',
    }) as bigint;
  }

  /**
   * Get full round information
   */
  async getRound(roundId: bigint): Promise<RoundInfo> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getRound',
      args: [roundId],
    }) as readonly [bigint, boolean, `0x${string}`, bigint, number, boolean, boolean, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

    return {
      roundId,
      requestedAt: result[0],
      resolved: result[1],
      randomnessId: result[2],
      randomnessValue: result[3],
      winningSquare: Number(result[4]),
      jackpotHit: result[5],
      singleMinerRound: result[6],
      singleMinerWinner: result[7],
      totalWager: result[8],
      fee: result[9],
      winnerTotal: result[10],
      potForWinners: result[11],
      slvrForWinners: result[12],
      payoutMulWad: result[13],
      slvrMulWad: result[14],
      totalUnclaimedSlvr: result[15],
    };
  }

  /**
   * Get total amount bet on a square for a round
   */
  async getTotalOnSquare(roundId: bigint, square: number): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getTotalOnSquare',
      args: [roundId, square],
    }) as bigint;
  }

  /**
   * Get number of bettors on a square for a round
   */
  async getBettorsOnSquare(roundId: bigint, square: number): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getBettorsOnSquare',
      args: [roundId, square],
    }) as bigint;
  }

  /**
   * Get a user's bet amount on a square for a round
   */
  async getUserBet(roundId: bigint, square: number, bettor: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getUserBet',
      args: [roundId, square, bettor],
    }) as bigint;
  }

  /**
   * Check if a user has claimed rewards for a round
   */
  async getHasClaimed(roundId: bigint, user: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getHasClaimed',
      args: [roundId, user],
    }) as boolean;
  }

  /**
   * Get miner state for an account
   */
  async getMinerState(account: Address): Promise<MinerState> {
    const result = await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getMinerState',
      args: [account],
    }) as readonly [bigint, bigint, bigint, boolean];

    return {
      rewardsSlvr: result[0],
      refinedAccrued: result[1],
      indexSnapshot: result[2],
      hasAccount: result[3],
    };
  }

  /**
   * Check if an account exists
   */
  async hasAccount(account: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getHasAccount',
      args: [account],
    }) as boolean;
  }

  /**
   * Get carry-over winner native pool (when no winners)
   */
  async carryWinnerNativePool(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'carryWinnerNativePool',
    }) as bigint;
  }

  /**
   * Get staker rewards that failed to distribute (owed)
   */
  async carryStakerNativeOwed(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'carryStakerNativeOwed',
    }) as bigint;
  }

  /**
   * Get jackpot funds that failed to add (owed)
   */
  async carryJackpotNativeOwed(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'carryJackpotNativeOwed',
    }) as bigint;
  }

  /**
   * Get carry-over SLVR pool
   */
  async carrySlvrPool(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'carrySlvrPool',
    }) as bigint;
  }

  /**
   * Get the configured SLVR-per-round value.
   *
   * NOTE: This is no longer the authoritative emission number. Emission is hub-gated: the amount
   * actually minted each round is bounded by the game's streamed emission budget on SlvrHub
   * (see SlvrHub.pendingEmission / mintReward). Treat this only as the requested/target value.
   */
  async slvrPerRound(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'slvrPerRound',
    }) as bigint;
  }

  /**
   * Get protocol fee in basis points
   */
  async protocolFeeBps(): Promise<number> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'protocolFeeBps',
    }) as number;
  }

  /**
   * Get grid size (should be 25)
   */
  async grid(): Promise<number> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'GRID',
    }) as number;
  }

  /**
   * Get account deposit amount
   */
  async accountDeposit(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'ACCOUNT_DEPOSIT',
    }) as bigint;
  }

  /**
   * Place a bet on the current round
   * Note: The contract will automatically handle account deposit for new accounts.
   * If the beneficiary is a new account, ensure msg.value >= ACCOUNT_DEPOSIT + total bet amount.
   * @param params Bet parameters
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async bet(params: BetParams): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('betting');
    }

    const { roundId, squares, amounts, beneficiary } = params;

    // Validate inputs
    if (roundId < 0n) {
      throw new ContractCallError('Round ID must be non-negative');
    }
    validateSquares(squares);
    validateArrayLengths([squares, amounts], ['squares', 'amounts']);
    
    for (const amount of amounts) {
      validateAmount(amount, 'bet amount');
    }

    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0n);

    try {
      // Check if account exists, if not, add account deposit to the value sent
      const beneficiaryAddress = beneficiary 
        ? validateAddress(beneficiary, 'beneficiary')
        : this.walletClient.account!.address;
      
      const hasAccount_ = await this.hasAccount(beneficiaryAddress);
      const accountDeposit_ = hasAccount_ ? 0n : await this.accountDeposit();
      const totalValue = totalAmount + accountDeposit_;

      if (beneficiary) {
        return await this.walletClient.writeContract({
          address: this.address,
          abi: SlvrGridLottery.ABI,
          functionName: 'betFor',
          args: [roundId, beneficiaryAddress, squares, amounts],
          value: totalValue,
          account: this.walletClient.account!,
          chain: null,
        });
      } else {
        return await this.walletClient.writeContract({
          address: this.address,
          abi: SlvrGridLottery.ABI,
          functionName: 'bet',
          args: [roundId, squares, amounts],
          value: totalValue,
          account: this.walletClient.account!,
          chain: null,
        });
      }
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to place bet: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Claim rewards for a round
   * @param params Claim parameters
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async claim(params: ClaimParams): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('claiming');
    }

    if (params.roundId < 0n) {
      throw new ContractCallError('Round ID must be non-negative');
    }

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrGridLottery.ABI,
        functionName: 'claim',
        args: [params.roundId],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to claim rewards: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Advanced claim function covering all claim variants
   * Handles: user vs delegate, native/SLVR recipients, bypassFee, ethOnly
   * @param params Advanced claim parameters
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async claimAdvanced(params: ClaimParamsAdvanced): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('claiming');
    }

    if (params.roundId < 0n) {
      throw new ContractCallError('Round ID must be non-negative');
    }

    const user = validateAddress(params.user, 'user');
    const recipientNative = params.recipientNative 
      ? validateAddress(params.recipientNative, 'recipientNative')
      : '0x0000000000000000000000000000000000000000' as Address;
    const recipientSlvr = params.recipientSlvr
      ? validateAddress(params.recipientSlvr, 'recipientSlvr')
      : '0x0000000000000000000000000000000000000000' as Address;

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrGridLottery.ABI,
        functionName: 'claimAdvanced',
        args: [{
          user,
          roundId: params.roundId,
          recipientNative,
          recipientSlvr,
          bypassFee: params.bypassFee || false,
          ethOnly: params.ethOnly || false,
        }],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to claim rewards: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Batch claim rewards for multiple rounds
   * Note: This sends multiple transactions sequentially. For better UX, consider
   * using a multicall contract or batching in your application layer.
   * @param roundIds Array of round IDs to claim
   * @param user User address to claim for (defaults to wallet client account)
   * @param options Optional configuration
   * @param options.waitForReceipt Whether to wait for each transaction receipt (default: false)
   * @returns Array of transaction hashes
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async batchClaim(
    roundIds: bigint[], 
    user?: Address,
    options?: { waitForReceipt?: boolean }
  ): Promise<`0x${string}`[]> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('batch claiming');
    }

    if (roundIds.length === 0) {
      throw new ContractCallError('No rounds to claim');
    }

    const claimUser = user ? validateAddress(user, 'user') : this.walletClient.account!.address;
    const hashes: `0x${string}`[] = [];

    for (const roundId of roundIds) {
      if (roundId < 0n) {
        throw new ContractCallError(`Invalid round ID: ${roundId}`);
      }

      try {
        const hash = await this.claimAdvanced({
          user: claimUser,
          roundId,
        });

        hashes.push(hash);

        // Optionally wait for receipt before proceeding
        if (options?.waitForReceipt) {
          await waitForTransactionReceipt(this.publicClient, hash);
        }
      } catch (error) {
        // If one claim fails, we still return the hashes we've collected so far
        // The caller can decide how to handle partial failures
        throw new ContractCallError(
          `Failed to claim round ${roundId}: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      }
    }

    return hashes;
  }

  /**
   * Approve a delegate to claim rewards on your behalf
   */
  async approveDelegate(delegate: Address): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('approving delegate');
    }
    const delegateAddress = validateAddress(delegate, 'delegate');
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'approveDelegate',
      args: [delegateAddress],
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Revoke a delegate's approval to claim on your behalf
   */
  async revokeDelegate(delegate: Address): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('revoking delegate');
    }
    const delegateAddress = validateAddress(delegate, 'delegate');
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'revokeDelegate',
      args: [delegateAddress],
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Check if a delegate is approved for a user
   */
  async getDelegate(user: Address, delegate: Address): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'getDelegate',
      args: [user, delegate],
    }) as boolean;
  }

  /**
   * Donate SLVR tokens directly to the jackpot pool.
   * Note: caller must have approved the lottery to spend `amount` of SLVR beforehand.
   */
  async donateSlvrToJackpot(amount: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('donating to jackpot');
    }
    validateAmount(amount, 'donation amount');
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'donateSlvrToJackpot',
      args: [amount],
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Add ETH (native) tokens to the jackpot pool
   * @param value Amount of native ETH to deposit
   */
  async addEthToJackpot(value: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('adding ETH to jackpot');
    }
    validateAmount(value, 'jackpot amount');
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'addEthToJackpot',
      value,
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Withdraw your accumulated mined SLVR (the "refine and cash out" path).
   *
   * Settles your miner accrual (auto-checkpoints) and transfers your SLVR out,
   * net of the refining fee. This is the function a mining bot wants to realize
   * SLVR rewards outside of a specific round claim. Reverts if you have nothing to
   * withdraw. The exact `(totalPayout, refiningFee)` are in the emitted `Claimed`
   * event; this returns the transaction hash.
   */
  async withdrawUnrefinedSlvr(): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('withdrawing unrefined SLVR');
    }
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'withdrawUnrefinedSlvr',
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Force on-chain settlement of a miner's refined-reward accrual (lazy
   * "checkpoint"). Permissionless — you can checkpoint any account.
   *
   * This only updates accounting (rolls index growth into `refinedAccrued`); it
   * moves no tokens. You rarely need it: `claim` and {@link withdrawUnrefinedSlvr}
   * both checkpoint internally, and the up-to-date figure can be derived off-chain
   * from {@link getMinerState}. Use it when you want state settled without a
   * claim/withdraw — e.g. to make a subsequent `getMinerState` read exact.
   */
  async checkpoint(account: Address): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('checkpointing');
    }
    return await this.walletClient.writeContract({
      address: this.address,
      abi: SlvrGridLottery.ABI,
      functionName: 'checkpoint',
      args: [account],
      account: this.walletClient.account!,
      chain: null,
    });
  }

  /**
   * Get all square data for a round
   */
  async getRoundSquares(roundId: bigint): Promise<Array<{ square: number; total: bigint; bettors: bigint }>> {
    const gridSize = await this.grid();
    const squares = Array.from({ length: gridSize }, (_, i) => i);

    // Fast path: batch all 2×gridSize reads into a single multicall. Requires the
    // client's chain to know Multicall3 (robinhoodChain registers it). Falls back
    // to parallel individual reads on any chain/client without it.
    try {
      const contracts = squares.flatMap((sq) => [
        { address: this.address, abi: SlvrGridLottery.ABI, functionName: 'getTotalOnSquare', args: [roundId, sq] },
        { address: this.address, abi: SlvrGridLottery.ABI, functionName: 'getBettorsOnSquare', args: [roundId, sq] },
      ]);
      const res = (await this.publicClient.multicall({
        contracts: contracts as never,
        allowFailure: false,
      })) as bigint[];
      return squares.map((square, i) => ({ square, total: res[i * 2]!, bettors: res[i * 2 + 1]! }));
    } catch {
      const [totals, bettors] = await Promise.all([
        Promise.all(squares.map((sq) => this.getTotalOnSquare(roundId, sq))),
        Promise.all(squares.map((sq) => this.getBettorsOnSquare(roundId, sq))),
      ]);
      return squares.map((square, i) => ({ square, total: totals[i]!, bettors: bettors[i]! }));
    }
  }

  /**
   * Get user's bets for a round
   */
  async getUserBets(roundId: bigint, user: Address): Promise<Array<{ square: number; amount: bigint }>> {
    const gridSize = await this.grid();
    const squares = Array.from({ length: gridSize }, (_, i) => i);

    // Batch via multicall when available; fall back to parallel reads otherwise.
    let bets: bigint[];
    try {
      const contracts = squares.map((sq) => ({
        address: this.address,
        abi: SlvrGridLottery.ABI,
        functionName: 'getUserBet',
        args: [roundId, sq, user],
      }));
      bets = (await this.publicClient.multicall({ contracts: contracts as never, allowFailure: false })) as bigint[];
    } catch {
      bets = await Promise.all(squares.map((sq) => this.getUserBet(roundId, sq, user)));
    }

    return squares
      .map((square, i) => ({ square, amount: bets[i]! }))
      .filter((bet): bet is { square: number; amount: bigint } => bet.amount > 0n);
  }

  // ---------------------------------------------------------------------------
  // Reactive helpers
  // ---------------------------------------------------------------------------

  /**
   * Wait until a round is resolved, resolving with its final {@link RoundInfo}.
   * Polls `getRound` on an interval — handy for "bet, then claim once it settles".
   *
   * @param opts.pollIntervalMs how often to check (default 4000)
   * @param opts.timeoutMs give up after this long (default: wait indefinitely)
   * @throws {Error} if `timeoutMs` elapses before resolution
   */
  async waitForResolution(
    roundId: bigint,
    opts: { pollIntervalMs?: number; timeoutMs?: number } = {}
  ): Promise<RoundInfo> {
    const interval = opts.pollIntervalMs ?? 4000;
    const deadline = opts.timeoutMs !== undefined ? Date.now() + opts.timeoutMs : Infinity;
    for (;;) {
      const round = await this.getRound(roundId);
      if (round.resolved) return round;
      if (Date.now() >= deadline) throw new Error(`round ${roundId} not resolved within ${opts.timeoutMs}ms`);
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  /**
   * Subscribe to `RoundResolved` events. Returns an unsubscribe function.
   *
   * @example
   * ```typescript
   * const stop = sdk.lottery.watchRoundResolved((e) => {
   *   console.log(`round ${e.roundId} won by square ${e.winningSquare}`);
   * });
   * // later: stop();
   * ```
   */
  watchRoundResolved(
    onResolved: (event: RoundResolvedEvent['args']) => void,
    opts: { onError?: (error: Error) => void } = {}
  ): () => void {
    return this.publicClient.watchContractEvent({
      address: this.address,
      abi: SlvrGridLotteryEvents,
      eventName: 'RoundResolved',
      onLogs: (logs) => {
        for (const log of logs) onResolved((log as unknown as { args: RoundResolvedEvent['args'] }).args);
      },
      onError: opts.onError,
      poll: true,
    });
  }

  /**
   * Subscribe to `BetPlaced` events (optionally for one round). Returns an
   * unsubscribe function. Useful for reacting to pot changes in real time.
   */
  watchBets(
    onBet: (event: BetPlacedEvent['args']) => void,
    opts: { roundId?: bigint; onError?: (error: Error) => void } = {}
  ): () => void {
    return this.publicClient.watchContractEvent({
      address: this.address,
      abi: SlvrGridLotteryEvents,
      eventName: 'BetPlaced',
      args: opts.roundId !== undefined ? ({ roundId: opts.roundId } as never) : undefined,
      onLogs: (logs) => {
        for (const log of logs) onBet((log as unknown as { args: BetPlacedEvent['args'] }).args);
      },
      onError: opts.onError,
      poll: true,
    });
  }
}

