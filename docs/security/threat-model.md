# Security Architecture & Threat Model

## 1. Trust Boundaries
- **Untrusted Zone:**
  - Remote Hugging Face Hub (arbitrary model cards, README markdown, user-submitted binaries, pickle/PyTorch files).
  - External network endpoints.
- **Semi-Trusted Zone:**
  - Local runtime daemon HTTP ports (`11434`, `8080`, `8000`).
- **Trusted Zone:**
  - Electron Main Process (Node 26).
  - Windows Credential Manager (`Windows.Security.Credentials.PasswordVault`).
  - Local SQLite Database.

## 2. Threat Mitigations
1. **Remote Code Execution via Untrusted Weights:**
   - **Mitigation:** The application strictly prioritizes `GGUF` and `SafeTensors` formats. Legacy PyTorch `.bin` and pickle checkpoints are flagged with explicit red security warnings and blocked from automated execution to prevent arbitrary Python unpickling RCE.
2. **Credential Leakage:**
   - **Mitigation:** Hugging Face User Access Tokens are stored exclusively in OS-protected credential storage.
   - Tokens are **never** logged, never inserted into the SQLite database, never passed as command-line arguments to subprocesses, and never forwarded across redirects to non-HuggingFace hosts.
3. **Renderer Process Exploitation (XSS / Webview Breakout):**
   - **Mitigation:** `nodeIntegration: false`, `contextIsolation: true`, strict CSP headers. Model Card markdown is sanitized to strip script tags, iframes, and active content.
4. **Denial of Service / Uncontrolled Resource Consumption:**
   - **Mitigation:** Free disk space check prior to download. Mathematical VRAM calculator warns before downloading models that will cause system thrashing or OOM crashes.
