import { Address, parseAbi, PublicClient, WalletClient } from 'viem';
import { WalletClientRequiredError, ContractCallError } from '../errors';
import { validateAddress, validateAmount } from '../utils';

/**
 * SlvrToken contract interface
 */
export class SlvrToken {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private address: Address;

  private static readonly ABI = parseAbi([
    // ERC20 standard functions
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    
    // SlvrToken specific
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function MAX_SUPPLY() view returns (uint256)',
    'function burn(uint256 amount)',
    'function burnFrom(address account, uint256 amount)',
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
   * Get total supply
   */
  async totalSupply(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrToken.ABI,
      functionName: 'totalSupply',
    });
  }

  /**
   * Get balance of an account
   */
  async balanceOf(account: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrToken.ABI,
      functionName: 'balanceOf',
      args: [account],
    });
  }

  /**
   * Get allowance
   */
  async allowance(owner: Address, spender: Address): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrToken.ABI,
      functionName: 'allowance',
      args: [owner, spender],
    });
  }

  /**
   * Get token name
   */
  async name(): Promise<string> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrToken.ABI,
      functionName: 'name',
    });
  }

  /**
   * Get token symbol
   */
  async symbol(): Promise<string> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrToken.ABI,
      functionName: 'symbol',
    });
  }

  /**
   * Get token decimals
   */
  async decimals(): Promise<number> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrToken.ABI,
      functionName: 'decimals',
    });
  }

  /**
   * Get maximum supply
   */
  async maxSupply(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.address,
      abi: SlvrToken.ABI,
      functionName: 'MAX_SUPPLY',
    });
  }

  /**
   * Transfer tokens
   * @param to Recipient address
   * @param amount Amount to transfer
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async transfer(to: Address, amount: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('transferring');
    }

    const recipient = validateAddress(to, 'recipient');
    validateAmount(amount, 'transfer amount');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrToken.ABI,
        functionName: 'transfer',
        args: [recipient, amount],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to transfer: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Approve spender
   * @param spender Address to approve
   * @param amount Amount to approve
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async approve(spender: Address, amount: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('approving');
    }

    const spenderAddress = validateAddress(spender, 'spender');
    validateAmount(amount, 'approval amount');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrToken.ABI,
        functionName: 'approve',
        args: [spenderAddress, amount],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to approve: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Transfer from (requires approval)
   * @param from Sender address
   * @param to Recipient address
   * @param amount Amount to transfer
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async transferFrom(from: Address, to: Address, amount: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('transferFrom');
    }

    const fromAddress = validateAddress(from, 'from');
    const toAddress = validateAddress(to, 'to');
    validateAmount(amount, 'transfer amount');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrToken.ABI,
        functionName: 'transferFrom',
        args: [fromAddress, toAddress, amount],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to transferFrom: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Burn tokens
   * @param amount Amount to burn
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if amount is invalid
   * @throws ContractCallError if contract call fails
   */
  async burn(amount: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('burning');
    }

    validateAmount(amount, 'burn amount');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrToken.ABI,
        functionName: 'burn',
        args: [amount],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to burn: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }

  /**
   * Burn tokens from account
   * @param account Account to burn from
   * @param amount Amount to burn
   * @returns Transaction hash
   * @throws WalletClientRequiredError if wallet client is not available
   * @throws ValidationError if inputs are invalid
   * @throws ContractCallError if contract call fails
   */
  async burnFrom(account: Address, amount: bigint): Promise<`0x${string}`> {
    if (!this.walletClient) {
      throw new WalletClientRequiredError('burnFrom');
    }

    const accountAddress = validateAddress(account, 'account');
    validateAmount(amount, 'burn amount');

    try {
      return await this.walletClient.writeContract({
        address: this.address,
        abi: SlvrToken.ABI,
        functionName: 'burnFrom',
        args: [accountAddress, amount],
        account: this.walletClient.account!,
        chain: null,
      });
    } catch (error) {
      if (error instanceof WalletClientRequiredError || error instanceof ContractCallError) {
        throw error;
      }
      throw new ContractCallError(`Failed to burnFrom: ${error instanceof Error ? error.message : String(error)}`, error);
    }
  }
}

