import { describe, it, expect } from 'vitest';
import { CredentialVault } from '../src/core/credential-vault';

describe('Credential Vault Integration', () => {
  const testAccount = 'test_hf_account_' + Date.now();
  const dummyToken = 'hf_test_mock_token_1234567890';

  it('saves and retrieves token securely', async () => {
    const saved = await CredentialVault.saveHfToken(dummyToken, testAccount);
    expect(saved).toBe(true);

    const retrieved = await CredentialVault.getHfToken(testAccount);
    expect(retrieved).toBe(dummyToken);
  }, 15000);

  it('removes token successfully', async () => {
    await CredentialVault.removeHfToken(testAccount);
    const after = await CredentialVault.getHfToken(testAccount);
    expect(after).toBeNull();
  }, 15000);

  it('handles invalid token validation rejection safely without exceptions', async () => {
    const result = await CredentialVault.validateHfToken('hf_invalid_token_test');
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});
