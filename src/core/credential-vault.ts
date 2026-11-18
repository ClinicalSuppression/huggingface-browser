import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';

const execAsync = promisify(exec);
const VAULT_RESOURCE = 'HuggingFaceModelBrowser';

export class CredentialVault {
  /**
   * Saves a Hugging Face User Access Token into Windows Credential Manager
   * using Windows.Security.Credentials.PasswordVault.
   */
  public static async saveHfToken(token: string, accountName: string = 'default'): Promise<boolean> {
    if (process.platform === 'win32') {
      try {
        const psScript = `
          Add-Type -AssemblyName System.Security
          $vault = New-Object Windows.Security.Credentials.PasswordVault
          $cred = New-Object Windows.Security.Credentials.PasswordCredential('${VAULT_RESOURCE}', '${accountName}', '${token}')
          $vault.Add($cred)
        `;
        await execAsync(`powershell.exe -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`);
        return true;
      } catch (err) {
        console.error('Failed to save token to Windows PasswordVault, using fallback:', err);
      }
    }
    // In-memory fallback
    this.memoryTokens.set(accountName, token);
    return true;
  }

  /**
   * Retrieves the Hugging Face User Access Token from Windows Credential Manager.
   */
  public static async getHfToken(accountName: string = 'default'): Promise<string | null> {
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
        const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`);
        const token = stdout.trim();
        if (token) {
          return token;
        }
      } catch {
        // Fall back to memory
      }
    }
    return this.memoryTokens.get(accountName) || null;
  }

  /**
   * Deletes the Hugging Face User Access Token from Windows Credential Manager.
   */
  public static async removeHfToken(accountName: string = 'default'): Promise<boolean> {
    if (process.platform === 'win32') {
      try {
        const psScript = `
          $vault = New-Object Windows.Security.Credentials.PasswordVault
          try {
            $cred = $vault.Retrieve('${VAULT_RESOURCE}', '${accountName}')
            $vault.Remove($cred)
          } catch {}
        `;
        await execAsync(`powershell.exe -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`);
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
