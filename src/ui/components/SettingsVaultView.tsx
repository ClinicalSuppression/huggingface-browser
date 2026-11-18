import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Eye, EyeOff, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { bridgeService } from '../data/mockService';

export const SettingsVaultView: React.FC = () => {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    bridgeService.getToken().then((existing) => {
      if (existing) {
        setToken(existing);
        setHasStoredToken(true);
      }
    });
  }, []);

  const handleSaveAndValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setIsWorking(true);
    setStatusMsg(null);

    const validation = await bridgeService.validateToken(token.trim());
    if (!validation.valid) {
      setStatusMsg({
        type: 'error',
        text: validation.error || 'Invalid Hugging Face token.',
      });
      setIsWorking(false);
      return;
    }

    await bridgeService.saveToken(token.trim());
    setHasStoredToken(true);
    setStatusMsg({
      type: 'success',
      text: `Token validated for "${validation.username || 'HF User'}" and encrypted in Windows Credential Vault.`,
    });
    setIsWorking(false);
  };

  const handleRemove = async () => {
    await bridgeService.removeToken();
    setToken('');
    setHasStoredToken(false);
    setStatusMsg({ type: 'success', text: 'Token removed from Windows Credential Vault.' });
  };

  return (
    <section aria-label="Settings and Hugging Face Token Vault" className="flex h-full flex-col">
      <header className="border-b border-white/[0.08] bg-[#090d16]/75 px-6 py-5">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Settings &amp; HF Token Vault
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Manage your Hugging Face access token for gated models (Llama, Gemma) via encrypted OS storage
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          <form onSubmit={handleSaveAndValidate} className="fluent-card rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#38bdf8]/30 bg-[#0078d4]/20 text-[#38bdf8]">
                  <KeyRound className="h-5 w-5" aria-hidden={true} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Hugging Face Access Token</h2>
                  <p className="text-xs text-slate-400">
                    Protected with Electron safeStorage / Windows DPAPI
                  </p>
                </div>
              </div>

              {hasStoredToken && (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden={true} />
                  Vaulted
                </span>
              )}
            </div>

            <div>
              <label htmlFor="hf-token-input" className="mb-1.5 block text-xs font-medium text-slate-300">
                Personal Access Token (Read permission)
              </label>
              <div className="relative">
                <input
                  id="hf-token-input"
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  autoComplete="off"
                  className="w-full rounded-lg border border-white/[0.1] bg-[#090d16] py-2.5 pl-3.5 pr-10 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-[#38bdf8] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" aria-hidden={true} />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden={true} />
                  )}
                </button>
              </div>
            </div>

            {statusMsg && (
              <div
                role="status"
                className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  statusMsg.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}
              >
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden={true} />
                )}
                <span>{statusMsg.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {hasStoredToken ? (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
                  Remove Token
                </button>
              ) : (
                <span />
              )}

              <button
                type="submit"
                disabled={isWorking || !token.trim()}
                className="rounded-lg bg-[#0078d4] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1084d8] disabled:opacity-50"
              >
                {isWorking ? 'Validating...' : 'Validate & Save to Vault'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};
