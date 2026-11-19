import { describe, it, expect } from 'vitest';
import { CredentialVault } from '../src/core/credential-vault';

describe('Credential Vault Integration', () => {
  const testAccount = 'test_hf_account_' + Date.now();
  const dummyToken = 'hf_test_mock_token_1234567890';

  it('saves and retrieves token securely', async () => {
    const saved = await CredentialVault.saveHfToken(dummyToken, testAccount);
    expect(saved.saved).toBe(true);
    expect(typeof saved.persistent).toBe('boolean');

    const retrieved = await CredentialVault.getHfToken(testAccount);
    expect(retrieved).toBe(dummyToken);
  }, 15000);

  it('removes token successfully', async () => {
    await CredentialVault.removeHfToken(testAccount);
    const after = await CredentialVault.getHfToken(testAccount);
    expect(after).toBeNull();
  }, 15000);

  it('rejects account-name injection before invoking PowerShell', async () => {
    const payload = "account'; Write-Output 'injected";
    await expect(CredentialVault.saveHfToken(dummyToken, payload)).rejects.toThrow('Invalid credential account name');
    await expect(CredentialVault.getHfToken(payload)).rejects.toThrow('Invalid credential account name');
    await expect(CredentialVault.hasHfToken(payload)).rejects.toThrow('Invalid credential account name');
    await expect(CredentialVault.removeHfToken(payload)).rejects.toThrow('Invalid credential account name');
  });

  it('handles invalid token validation rejection safely without exceptions', async () => {
    const result = await CredentialVault.validateHfToken('hf_invalid_token_test');
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});
