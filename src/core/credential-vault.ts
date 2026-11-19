import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import crypto from 'crypto';
import os from 'os';

const execAsync = promisify(exec);
const VAULT_RESOURCE = 'HuggingFaceModelBrowser';
const MACHINE_SECRET = os.hostname() + (process.env.COMPUTERNAME || '') + os.platform() + os.arch();
const ACCOUNT_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

function validateAccountName(accountName: string): void {
  if (!ACCOUNT_NAME_PATTERN.test(accountName)) {
    throw new Error('Invalid credential account name');
  }
}

async function runPowerShell(script: string, timeoutMs: number = 3000): Promise<string> {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execAsync(`powershell.exe -NoProfile -NonInteractive -EncodedCommand ${b64}`, {
    timeout: timeoutMs,
  });
  return stdout;
}

function encryptToken(token: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(MACHINE_SECRET, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `enc_v1:${salt.toString('hex')}:${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptToken(storedValue: string): string {
  if (!storedValue || !storedValue.startsWith('enc_v1:')) {
    return storedValue; // fallback for plaintext or mock tokens in tests
  }
  try {
    const parts = storedValue.split(':');
    if (parts.length !== 5) return storedValue;
    const [, saltHex, ivHex, tagHex, cipherHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = crypto.pbkdf2Sync(MACHINE_SECRET, salt, 100000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return storedValue;
  }
}

export class CredentialVault {
  /**
   * Saves a Hugging Face User Access Token into Windows Credential Manager
   * or memory fallback using salted AES-256-GCM encryption.
   */
  public static async saveHfToken(token: string, accountName: string = 'default'): Promise<{ saved: boolean; persistent: boolean }> {
    validateAccountName(accountName);
    const encryptedToken = encryptToken(token);
    if (process.platform === 'win32') {
      try {
        const psScript = `
          Add-Type -AssemblyName System.Security
          $vault = New-Object Windows.Security.Credentials.PasswordVault
          try {
            $existing = $vault.Retrieve('${VAULT_RESOURCE}', '${accountName}')
            $vault.Remove($existing)
          } catch {}
          $cred = New-Object Windows.Security.Credentials.PasswordCredential('${VAULT_RESOURCE}', '${accountName}', '${encryptedToken}')
          $vault.Add($cred)
        `;
        await runPowerShell(psScript);
        this.memoryTokens.set(accountName, encryptedToken);
        return { saved: true, persistent: true };
      } catch (err) {
        console.error('Failed to save token to Windows PasswordVault, using fallback:', err);
      }
    }
    this.memoryTokens.set(accountName, encryptedToken);
    return { saved: true, persistent: false };
  }

  /**
   * Retrieves and decrypts the Hugging Face User Access Token from Windows Credential Manager or memory.
   */
  public static async getHfToken(accountName: string = 'default'): Promise<string | null> {
    validateAccountName(accountName);
    let storedValue: string | null = null;
    if (process.platform === 'win32') {
      try {
        const psScript = `
          $vault = New-Object Windows.Security.Credentials.PasswordVault
          try {
            $cred = $vault.Retrieve('${VAULT_RESOURCE}', '${accountName}')
            $cred.RetrievePassword()
            Write-Output $cred.Password
          } catch {
            Write-Output ""
          }
        `;
        const stdout = await runPowerShell(psScript);
        const val = stdout.trim();
        if (val) {
          storedValue = val;
        }
      } catch {
        // Fall back to memory
      }
    }
    if (!storedValue) {
      storedValue = this.memoryTokens.get(accountName) || null;
    }
    if (!storedValue) return null;
    return decryptToken(storedValue);
  }

  /**
   * Checks whether a token is stored without decrypting or returning its value.
   */
  public static async hasHfToken(accountName: string = 'default'): Promise<boolean> {
    validateAccountName(accountName);
    if (process.platform === 'win32') {
      try {
        const psScript = `
          $vault = New-Object Windows.Security.Credentials.PasswordVault
          try {
            $cred = $vault.Retrieve('${VAULT_RESOURCE}', '${accountName}')
            Write-Output "true"
          } catch {
            Write-Output "false"
          }
        `;
        const stdout = await runPowerShell(psScript);
        if (stdout.trim() === 'true') return true;
      } catch {
        // Fall back to memory
      }
    }
    return this.memoryTokens.has(accountName);
  }

  /**
   * Deletes the Hugging Face User Access Token from Windows Credential Manager and memory.
   */
  public static async removeHfToken(accountName: string = 'default'): Promise<boolean> {
    validateAccountName(accountName);
    if (process.platform === 'win32') {
      try {
        const psScript = `
          $vault = New-Object Windows.Security.Credentials.PasswordVault
          try {
            $cred = $vault.Retrieve('${VAULT_RESOURCE}', '${accountName}')
            $vault.Remove($cred)
          } catch {}
        `;
        await runPowerShell(psScript);
      } catch {}
    }
    this.memoryTokens.delete(accountName);
    return true;
  }

  /**
   * Validates a Hugging Face User Access Token by querying https://huggingface.co/api/whoami-v2
   */
  public static async validateHfToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: 'huggingface.co',
        path: '/api/whoami-v2',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'HF-Model-Browser-Windows/1.0',
        },
        timeout: 5000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              resolve({ valid: true, username: parsed.name || parsed.username || 'Authenticated User' });
            } catch {
              resolve({ valid: true, username: 'Authenticated User' });
            }
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({ valid: false, error: 'Invalid token or unauthorized' });
          } else {
            resolve({ valid: false, error: `Hugging Face returned status code ${res.statusCode}` });
          }
        });
      });

      req.on('error', (err) => {
        resolve({ valid: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ valid: false, error: 'Connection timed out' });
      });

      req.end();
    });
  }

  private static memoryTokens: Map<string, string> = new Map();
}
