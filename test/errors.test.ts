import { describe, it, expect } from 'vitest';
import { decodeSlvrRevert, SlvrRevertError, WalletClientRequiredError } from '../src';

describe('decodeSlvrRevert', () => {
  it('returns null for non-contract errors (so callers can rethrow the original)', () => {
    expect(decodeSlvrRevert(new Error('boom'))).toBeNull();
    expect(decodeSlvrRevert('nope')).toBeNull();
    expect(decodeSlvrRevert(undefined)).toBeNull();
  });
});

describe('error classes', () => {
  it('SlvrRevertError carries the decoded error name and is an Error', () => {
    const e = new SlvrRevertError('InsufficientValue', 'Reverted: InsufficientValue');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('SlvrRevertError');
    expect(e.errorName).toBe('InsufficientValue');
    expect(e.code).toBe('CONTRACT_REVERT');
  });

  it('WalletClientRequiredError explains what needed a wallet', () => {
    const e = new WalletClientRequiredError('betting');
    expect(e.message).toContain('betting');
    expect(e.code).toBe('WALLET_CLIENT_REQUIRED');
  });
});
