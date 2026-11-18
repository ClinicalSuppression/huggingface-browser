# Hugging Face Model Browser & Local Inference Hub: Master Implementation Plan

## Document Version & Scope
- **Status:** Complete Master Implementation Specification
- **Revision:** 3.3.0-PROD
- **Operating Target:** Windows 11 (x64 and ARM64), with optional WSL2 bridge for Linux-native engines.
- **Goal:** Build an enterprise-grade, commercial-quality desktop application for model discovery on Hugging Face, automated hardware-aware runtime detection, format/quantization inspection, purpose-specific inference parameter recommendations, and verified safe one-click deployment into local model serving runtimes.

---

# Table of Contents
1. Executive Summary & Architecture Overview
2. Runtime Deep-Dive & Quirks Registry
   - Meta Llama (Model Family Architecture)
   - llama.cpp
   - Ollama
   - xollama (`mann1x/xollama`)
   - vLLM
3. Universal Runtime Adapter System (URAS) Specification
4. Hugging Face Search & Artifact Intelligence Engine (SAIE)
5. Purpose-Specific Recommendation & Reasoning Engine (PRRE)
6. Hardware Profiling & VRAM Calculation Matrix
7. Windows 11 Fluent UI / UX & Design System Specification
8. Complete Step-by-Step Implementation Runbook
9. Verification, Smoke Testing & Hardening Matrix

---

# 1. Executive Summary & Architecture Overview

### 1.1 Architectural Pattern
The application is structured around an event-driven, decoupled desktop architecture:
```
┌────────────────────────────────────────────────────────────────────────┐
│                        Windows 11 Presentation                         │
│   Fluent Design System (Mica / Acrylic, WinUI 3 controls, Accessible)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC (Type-Safe RPC)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Application Core Controller (Rust)                  │
├────────────────────────────────┬───────────────────────────────────────┤
│ Search & Catalog Manager       │ Universal Runtime Adapter Core        │
│ - Hugging Face API Client      │ - Detection & Lifecycle Engine        │
│ - Artifact & GGUF Inspector    │ - Health Monitor & Process Supervisor │
│ - Token & Gated Auth Vault     │ - Safe Install & Verification Pipeline│
├────────────────────────────────┴───────────────────────────────────────┤
│ Recommendation & Hardware Engine                                       │
│ - Hardware Sensor Interface (NVML, DXGI, Win32 System Info)            │
│ - Mathematical VRAM Estimator & Multi-GPU Layer Allocator              │
│ - Purpose Parameter Registry (Instruct, Coding, Thinking/Reasoning)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Process / Network Boundary
┌───────────────────────────────────▼────────────────────────────────────┐
│                       External Serving Runtimes                        │
│   [llama.cpp]   [Ollama]   [xollama]   [vLLM (Native / WSL2)]   [...]  │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack & Spike Tie-Breaker Policy
- **Desktop Runtime Candidates:**
  - **Candidate A (Primary Baseline):** Tauri v2 (Rust core + TypeScript/React frontend). Optimal memory efficiency, tight OS process control, native Windows API bindings via `windows` crate, and small installer bundle.
  - **Candidate B:** C# .NET 9 WinUI 3 (Windows App SDK). First-party Windows 11 UI controls, native XAML accessibility, built-in MSIX packaging.
- **Strict Spike Time-Box & Tie-Breaker Rule:**
  - The comparative technical spike in Workstream 2 is strictly time-boxed to **1 focused session (max 8 engineering hours / 1 subagent delegation)** per candidate.
  - **Deterministic Tie-Breaker:** Candidate A (Tauri v2) is selected as the default winner *unless* the spike proves one of the following hard disqualifiers:
    1. Tauri v2 WebView2 isolation cannot guarantee zero-leak token storage or secure loopback OAuth listener termination.
    2. Windows 11 accessibility / UI Automation screen-reader tests fail and cannot be remedied with standard web ARIA tokens.
    3. Native Windows process cancellation / tree-killing in Rust exhibits zombie process leaks during aborted downloads/serving.
  - If Candidate A meets all criteria, Candidate A is chosen immediately without prolonged deliberation.
- **Secure Credential Storage:** Windows Credential Manager (`wincred` or Rust `keyring` crate) for Hugging Face User Access Tokens and remote runtime API keys. No raw tokens stored in SQLite or config files.
- **Local Database Engine:** SQLite 3 via `rusqlite` with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and enforced foreign keys.
- **Telemetry & Privacy Invariant:** Zero phone-home by default. Opt-in only. All prompt text, model inputs/outputs, and authentication credentials are unconditionally scrubbed from any diagnostics or exported logs.

---

# 2. Runtime Deep-Dive & Quirks Registry

### 2.1 Meta Llama (Model Family Architecture)
*Crucial distinction: Meta Llama is not a runtime.* It is Meta’s flagship family of open weights (Llama 1, Llama 2, Llama 3, Llama 3.1, Llama 3.2, Llama 3.3, Llama 4).
- **Quirks & Licensing:**
  - Gated repo status on Hugging Face (`meta-llama/Llama-3.3-70B-Instruct`). Requires an HF Token with accepted commercial license terms.
  - Chat template syntax: Uses `<|begin_of_text|>`, `<|start_header_id|>`, `<|end_header_id|>`, `<|eot_id|>`.
  - RoPE scaling: Llama 3+ uses rope_scaling with custom frequency base factors (`rope_theta = 500000.0`).
- **Handling in Browser:**
  - Catalog labels Llama models as "Model Family: Meta Llama".
  - Install plans route the model weights into an actual runtime adapter (llama.cpp, Ollama, xollama, or vLLM).

### 2.2 llama.cpp
- **Architecture:** Pure C/C++ inference engine targeting GGUF files.
- **Execution Modes:**
  1. CLI tool: `llama-cli.exe`
  2. Server tool: `llama-server.exe` (OpenAI and Anthropic compatible HTTP API).
- **Critical Quirks & Behavior:**
  - **HF Repo Fallback Bug/Quirk:** Using `llama-server -hf user/repo:quant` defaults to `Q4_K_M`. *If `Q4_K_M` does not exist in the repo, it silently downloads the first GGUF file in alphabetical order.* **Action:** Our app must never pass raw `-hf` without specifying the verified concrete file via `--hf-file` or downloading the exact target file directly.
  - **Sharded GGUFs:** Large models (e.g. 70B, 405B) are split into files like `model-00001-of-00004.gguf`. `llama.cpp` auto-detects subsequent shards only if named according to convention. When downloading directly, all shards must be fetched before model load.
  - **Multimodal Projectors:** Vision models require a separate `mmproj-*.gguf` file passed via `--mmproj <path>`.
  - **Memory Offloading:** Controlled via `-ngl` (`--n-gpu-layers`). 0 = pure CPU; 999 = offload all layers to VRAM. Supports partial CPU-RAM/GPU-VRAM splits.
  - **Flash Attention:** `--flash-attn [on|off|auto]`. Essential for long context on modern GPUs; may crash or degrade on older GPUs.
  - **Network Default:** Default binds to `127.0.0.1:9931`. Server features like `--tools` enable dangerous shell execution and local file edits; our adapter must strictly ensure `--tools` is off unless explicitly configured by the user with sandboxing warnings.

### 2.3 Ollama
- **Architecture:** Go daemon orchestrating `llama.cpp` runner sub-processes.
- **Default Port:** `11434` (`http://localhost:11434`).
- **Critical Quirks & Behavior:**
  - **Standard Pull vs GGUF Import:**
    - Standard: Pulls named manifests from the Ollama library (`ollama pull llama3.3`).
    - Custom HF Model: Can pull directly from Hugging Face hub if formatted as `ollama pull hf.co/user/repo:quant` (supported in recent versions), OR requires constructing a `Modelfile` with `FROM /path/to/model.gguf` followed by `ollama create <name> -f Modelfile`.
  - **API Contract:** Exposes native REST endpoints (`/api/generate`, `/api/chat`, `/api/create`, `/api/tags`, `/api/show`, `/api/version`) as well as OpenAI compatibility (`/v1/chat/completions`).
  - **Thinking/Reasoning Control:** Does not have a native think-budget limit in upstream releases; extended reasoning models will run until completion or token exhaustion unless `stop` sequences or max tokens are enforced.
  - **Context Length Quirk:** Default context size (`num_ctx`) is often 2048 unless explicitly overridden in the Modelfile or generation parameters (`options: { "num_ctx": 8192 }`).

### 2.4 xollama (`mann1x/xollama`)
- **Architecture:** Soft fork of upstream Ollama carrying unmerged upstream PRs and integrating the `opencoti-llamafile` engine.
- **Default Port:** `22434` (`http://localhost:22434`).
- **Environment Variables:** Listens via `XOLLAMA_HOST` (does not respond to `OLLAMA_HOST`). Configured via `XOLLAMA_ENGINE=opencoti|llamacpp|auto`.
- **Unique Capabilities & Quirks:**
  - **Independent Engine Execution:** Can run the opencoti engine for advanced KV quantization, rolling-KV windows, and shared KV pools.
  - **Think Budget:** Natively supports reasoning token bounds via upstream PR #17566.
  - **Direct Tokenizer APIs:** Implements `/api/tokenize` and `/api/detokenize` natively.
  - **Media Models:** Supports dedicated image generation (`/v1/images/generations`), TTS speech (`/v1/audio/speech`), and video routes.
  - **Windows Installer Quirk:** Windows binary `xOllamaSetup.exe` is unsigned; Windows Defender SmartScreen triggers on first launch. The application adapter must verify SHA256 hashes against published GitHub release checksums to guarantee user safety.
  - **Storage Sharing:** Models are stored in `/root/.ollama` or `%USERPROFILE%\.ollama`. Running Ollama and xollama simultaneously with overlapping model mutations can cause cache corruption.

### 2.5 vLLM
- **Architecture:** High-throughput, PagedAttention-driven Python/C++ serving engine for high-end GPUs.
- **Execution Mode:** CLI / Python service (`vllm serve <model-id>`). Exposes OpenAI-compatible server on default port `8000`.
- **Critical Quirks & Behavior:**
  - **Native Checkpoints vs GGUF:** Primarily built for unquantized Hugging Face safetensors (FP16/BF16) or modern GPU quantization formats (AWQ, GPTQ, FP8 W8A8 via LLM Compressor, NVFP4). GGUF support exists on CUDA but is secondary.
  - **Windows Compatibility Reality:** Official vLLM is native to Linux. Running on Windows requires either:
    1. WSL2 (Windows Subsystem for Linux with NVIDIA CUDA passthrough).
    2. Docker for Windows with WSL2 backend (`--gpus all`).
    *Adapter Requirement:* vLLM adapter on Windows must probe for WSL2 and `vllm` inside WSL2, or a running Docker container, or an HTTP network endpoint. It must not attempt raw Win32 process execution unless a native wheel is detected.
  - **Chat Template Enforcement:** Fails with HTTP 400 on `/v1/chat/completions` if the model's tokenizer lacks a valid Jinja2 chat template, unless `--chat-template <path>` is supplied at startup.
  - **VRAM Pre-allocation:** vLLM pre-allocates 90% of available GPU VRAM by default (`--gpu-memory-utilization 0.90`) for KV cache. If another model or process is occupying VRAM, vLLM crashes with OOM during initialization.

---

# 3. Universal Runtime Adapter System (URAS)

### 3.1 Formal Type-Safe Schema & Interface Contract
Every adapter and IPC payload must strictly adhere to these immutable, typed data structures:

```typescript
export type RuntimeId = 'llamacpp' | 'ollama' | 'xollama' | 'vllm' | 'custom_openai';
export type CapabilityStatus = 'supported' | 'unsupported' | 'conditional' | 'unknown';
export type EvidenceConfidence = 'verified_test' | 'documented' | 'inferred' | 'community' | 'unknown';
export type ModelFormat = 'gguf' | 'safetensors' | 'awq' | 'gptq' | 'fp8' | 'unknown';

export interface RuntimeVersion {
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly buildCommit?: string;
}

export interface GpuDeviceInfo {
  readonly id: string;
  readonly name: string;
  readonly vendor: 'nvidia' | 'amd' | 'intel' | 'qualcomm' | 'unknown';
  readonly vramTotalBytes: number;
  readonly vramFreeBytes: number;
  readonly driverVersion: string;
  readonly computeCapability?: string;
}

export interface HardwareProfile {
  readonly gpus: GpuDeviceInfo[];
  readonly systemRamTotalBytes: number;
  readonly systemRamAvailableBytes: number;
  readonly cpuArchitecture: 'x86_64' | 'arm64';
  readonly cpuLogicalCores: number;
  readonly supportsAvx2: boolean;
  readonly supportsAvx512: boolean;
  readonly capturedAtIso: string;
}

export interface ArtifactFileTarget {
  readonly fileId: string;
  readonly remoteUrl: string;
  readonly destinationRelativePath: string;
  readonly expectedSizeBytes: number;
  readonly sha256Checksum?: string;
  readonly role: 'primary_weights' | 'shard' | 'vision_projector' | 'tokenizer_config' | 'chat_template' | 'license';
}

export interface CompatibilityReport {
  readonly reportId: string;
  readonly runtimeId: RuntimeId;
  readonly status: CapabilityStatus;
  readonly format: ModelFormat;
  readonly reason: string;
  readonly confidence: EvidenceConfidence;
  readonly estimatedVramBytes: number;
  readonly estimatedSystemRamBytes: number;
  readonly fitsInGpuVram: boolean;
  readonly maxOffloadLayers: number;
  readonly recommendedContextLength: number;
  readonly recommendedFlags: Record<string, string | number | boolean>;
  readonly blockers: string[];
  readonly warnings: string[];
}

export interface InstallStep {
  readonly stepId: string;
  readonly sequence: number;
  readonly type: 'http_download' | 'file_move' | 'create_modelfile' | 'cli_exec' | 'api_register';
  readonly description: string;
  readonly payload: Record<string, unknown>;
  readonly rollbackAction?: 'delete_file' | 'unregister_model' | 'noop';
}

export interface InstallPlan {
  readonly planId: string;
  readonly runtimeId: RuntimeId;
  readonly modelRepo: string;
  readonly revision: string;
  readonly artifactFiles: ArtifactFileTarget[];
  readonly totalDownloadBytes: number;
  readonly requiredDiskSpaceBytes: number;
  readonly steps: InstallStep[];
  readonly verificationConfig: {
    readonly testEndpoint: string;
    readonly testModelTag: string;
    readonly testPrompt: string;
    readonly maxTimeoutSeconds: number;
  };
  readonly createdAtIso: string;
}

export interface InstallProgress {
  readonly planId: string;
  readonly currentStepIndex: number;
  readonly totalSteps: number;
  readonly stepDescription: string;
  readonly bytesDownloaded: number;
  readonly bytesTotal: number;
  readonly percentComplete: number;
  readonly downloadSpeedBytesPerSec: number;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly modelLoadedSuccessfully: boolean;
  readonly tokensGeneratedCount: number;
  readonly latencyToFirstTokenMs: number;
  readonly tokensPerSecond: number;
  readonly rawOutputSample?: string;
  readonly errorMessage?: string;
}

export interface IRuntimeAdapter {
  readonly id: RuntimeId;
  readonly displayName: string;
  detect(): Promise<RuntimeEnvironment | null>;
  healthCheck(): Promise<{ isHealthy: boolean; message?: string }>;
  listInstalledModels(): Promise<Array<{ id: string; sizeBytes: number; modifiedAtIso: string }>>;
  evaluateCompatibility(artifact: ArtifactFileTarget[], hw: HardwareProfile): Promise<CompatibilityReport>;
  createInstallPlan(artifact: ArtifactFileTarget[], hw: HardwareProfile, customOptions?: Record<string, unknown>): Promise<InstallPlan>;
  executeInstall(plan: InstallPlan, onProgress: (p: InstallProgress) => void, cancelSignal: AbortSignal): Promise<boolean>;
  verifyInstall(plan: InstallPlan): Promise<VerificationResult>;
  uninstallModel(modelTag: string): Promise<boolean>;
}
```

---

# 4. Hugging Face Search & Artifact Intelligence Engine (SAIE)

### 4.1 Search API Pipeline
The client communicates directly with Hugging Face Hub APIs:
1. `GET https://huggingface.co/api/models`
   - Parameters: `search`, `author`, `filter` (e.g. `pipeline_tag:text-generation`, `conversational`), `sort`, `direction=-1`, `limit=50`.
2. Detail query: `GET https://huggingface.co/api/models/{model_id}?expand[]=cardData&expand[]=siblings`
   - Sibling file tree parsing: Analyzes the complete file list for the repository.

### 4.2 Precision & Quantization Taxonomy Matrix
Every file sibling in a repository is categorized by the engine into:
- **Architecture Family:** Text Generation (`CausalLM`), Vision-Language (`VL`), Audio, Embedding, Reranking.
- **File Format:**
  - `GGUF`: Single file or shard set (`-00001-of-XXXXX.gguf`).
  - `SafeTensors`: `model.safetensors` or index shards.
  - `PyTorch Bin`: Legacy `.bin` files (flagged with security warning).
- **Quantization Classification Parser:**
  - Standard GGUF Types: `Q2_K`, `Q3_K_S`, `Q3_K_M`, `Q3_K_L`, `IQ4_XS`, `IQ4_NL`, `Q4_0`, `Q4_1`, `Q4_K_S`, `Q4_K_M`, `Q5_0`, `Q5_1`, `Q5_K_S`, `Q5_K_M`, `Q6_K`, `Q8_0`, `F16`, `BF16`.
  - Modern Compressed Formats: `FP8` (E4M3 / E5M2), `NVFP4`, `AWQ`, `GPTQ` (ActOrder, GroupSize), `BitsAndBytes` (NF4, FP4), `QAT` (Quantization-Aware Training), `GSQ-RCO`.

### 4.3 Safe Artifact Resolution Algorithm
When resolving a GGUF model:
```
1. Fetch all repository files (siblings).
2. Filter files ending with `.gguf`.
3. Separate multimodal projectors (`mmproj*.gguf`) from backbone weights.
4. Detect split shards matching regex: `^(.*?)-([0-9]{5})-of-([0-9]{5})\.gguf$`
   - Group shards by prefix and verify all N shards exist (1 through N).
5. Extract exact Quantization Label from filename:
   - Match regex `[._-]([iI]?[qQ][0-9]_[A-Za-z0-9_]+|[fF][13][62]|[bB][fF]16)[._-]`
6. If user selects a specific quant (e.g. Q4_K_M):
   - Locate the exact file or shard group.
   - If not found, explicitly mark "Variant Not Present" (NEVER fallback to first alphabetical file).
```

---

# 5. Purpose-Specific Recommendation & Reasoning Engine (PRRE)

Inference settings vary drastically by model architecture and prompt purpose. A universal default leads to poor outputs, hallucination, or looping.

### 5.1 Parameter Presets by Intent

| Parameter | Instruct / Chat | Reasoning / Deep Thinking | Coding / Strict Logic | Creative Writing |
|---|---|---|---|---|
| `temperature` | 0.70 | 0.20 – 0.60 | 0.10 – 0.20 | 0.90 – 1.10 |
| `top_p` | 0.90 | 0.95 | 0.85 | 0.98 |
| `top_k` | 40 | 20 | 20 | 60 |
| `min_p` | 0.05 | 0.05 | 0.02 | 0.08 |
| `repeat_penalty` | 1.10 | 1.05 | 1.00 – 1.05 | 1.15 |
| `presence_penalty`| 0.00 | 0.00 | 0.00 | 0.20 |
| `frequency_penalty`| 0.00 | 0.00 | 0.00 | 0.10 |
| `think_budget` | Disabled | 4096 – 16384 | Disabled / Low | Disabled |

### 5.2 Special Token & Reasoning Tag Auto-Detection
- **Thinking Models (DeepSeek R1, QwQ, Qwen 2.5/3 Thinking, Gemma 4 Thinking):**
  - Requires parsing `<think>...</think>` tags.
  - Server flag mapping:
    - `llama-server`: `--reasoning-format deepseek`
    - `xollama`: `--think-budget <n>` or `/api/chat` with `thinking: { "type": "enabled", "budget_tokens": N }`
    - `ollama`: Pass custom stop sequences if thinking tags need preservation.
- **Chat Template Extraction:**
  - Extracts `tokenizer_config.json` -> `chat_template`.
  - Informs the user whether Jinja template is native or requires template mapping.

---

# 6. Hardware Profiling & VRAM Calculation Matrix

### 6.1 Hardware Discovery Engine
- **Windows API Integration:**
  - **DXGI (DirectX Graphics Infrastructure):** Enumerate physical adapters, Dedicated Video Memory (VRAM), and Shared System Memory.
  - **NVML (`nvml.dll` via dynamic link):** If NVIDIA GPU present: queries Compute Capability (e.g. Ada Lovelace 8.9, Ampere 8.6, Blackwell 10.0), total VRAM, used VRAM, temperature, and driver version.
  - **Win32 System Information:** Queries physical RAM (`GlobalMemoryStatusEx`) and CPU thread count.

### 6.2 Precise Mathematical VRAM Estimation Formula
To prevent out-of-memory crashes before downloading:
$$\text{Total VRAM Required} = \text{Model Weights Memory} + \text{KV Cache Memory} + \text{Activation \& CUDA Context Overhead}$$

1. **Model Weights Memory:**
   $$\text{Memory}_{\text{weights}} = \text{File Size on Disk} \times 1.04 \quad (\text{tensor padding factor})$$
2. **KV Cache Memory:**
   For a context window of $C$ tokens, $L$ layers, $H_{\text{kv}}$ key-value heads, and head dimension $D$:
   $$\text{Memory}_{\text{KV}} = 2 \times L \times H_{\text{kv}} \times D \times C \times \text{BytesPerPrecision}$$
   - FP16 KV cache: 2 bytes per element.
   - Q8_0 KV cache: 1 byte per element.
   - Q4_0 KV cache: 0.5 bytes per element.
3. **Runtime Overhead:**
   - CUDA Context: 600 MB to 1.2 GB base.
   - Flash Attention buffer: ~400 MB.
4. **Fit Status Classification:**
   - **Full VRAM Fit:** $\text{Total Required} \le 0.90 \times \text{Free VRAM}$. Offload 100% of layers (`-ngl 999`).
   - **Partial CPU Offload (Split):** $\text{Model Weights} \le \text{Free VRAM} + 0.70 \times \text{Free RAM}$. App calculates exact split layer count:
     $$N_{\text{gpu\_layers}} = \left\lfloor \frac{\text{Free VRAM} - \text{Memory}_{\text{KV}} - \text{Overhead}}{\text{Bytes per Layer}} \right\rfloor$$
   - **Will Not Fit:** Exceeds combined VRAM + System RAM. UI marks with warning and disables install button unless "Force CPU Swapping" is toggled.

### 6.3 Local SQLite Persistence DDL & Migration Schema
The local database stores user preferences, cached model cards, installation jobs, and runtime tracking. It strictly uses schema versioning via `user_version` pragma:

```sql
-- PRAGMA user_version = 1;
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cached_models (
    model_repo TEXT PRIMARY KEY,
    pipeline_tag TEXT,
    author TEXT NOT NULL,
    downloads_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    is_gated INTEGER NOT NULL DEFAULT 0,
    card_summary TEXT,
    raw_siblings_json TEXT NOT NULL,
    cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cached_models_author ON cached_models(author);
CREATE INDEX IF NOT EXISTS idx_cached_models_gated ON cached_models(is_gated);

CREATE TABLE IF NOT EXISTS runtime_installations (
    runtime_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    executable_path TEXT,
    detected_version TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_health_check TEXT,
    is_healthy INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS install_jobs (
    job_id TEXT PRIMARY KEY,
    model_repo TEXT NOT NULL,
    revision TEXT NOT NULL,
    runtime_id TEXT NOT NULL,
    target_tag TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'downloading', 'verifying', 'completed', 'failed', 'cancelled')) NOT NULL,
    progress_percent REAL NOT NULL DEFAULT 0.0,
    bytes_downloaded INTEGER NOT NULL DEFAULT 0,
    bytes_total INTEGER NOT NULL DEFAULT 0,
    install_plan_json TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(runtime_id) REFERENCES runtime_installations(runtime_id)
);
CREATE INDEX IF NOT EXISTS idx_install_jobs_status ON install_jobs(status);

CREATE TABLE IF NOT EXISTS user_purpose_presets (
    preset_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    temperature REAL NOT NULL,
    top_p REAL NOT NULL,
    min_p REAL NOT NULL,
    repeat_penalty REAL NOT NULL,
    think_budget_tokens INTEGER DEFAULT 0,
    custom_stop_tokens TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0
);
```

**Schema Rules:**
- No token, password, or authorization secret may ever be inserted into any table.
- All timestamps are stored in UTC ISO 8601 strings (`datetime('now')`).
- All schema migrations must be strictly additive and tested backwards-compatible.

---

# 7. Windows 11 Fluent UI / UX & Design System Specification

### 7.1 Visual Layout Architecture
- **Window Shell:**
  - Acrylic/Mica material background using Windows 11 Desktop Window Manager (DWM) composition attributes.
  - Custom Titlebar with native minimize, maximize, and close controls; search quick-focus shortcut (`Ctrl + K`).
- **3-Pane Master Layout:**
  ```
  ┌─────────────┬──────────────────────────────────────┬───────────────────────────┐
  │ Sidebar Nav │ Main Search & Results Grid           │ Inspector & Detail Drawer │
  │             │                                      │ (Opens on Model Click)    │
  │ • Discover  │ [ Search Hugging Face...   Ctrl+K  ] ├───────────────────────────┤
  │ • Compare   │ ------------------------------------ │ Model Card (Header / Badges│
  │ • Installed │ Filters: [Quant v] [Task v] [Size v] ├───────────────────────────┤
  │ • Jobs (2)  │                                      │ File & Quant Picker (GGUF)│
  │ • Runtimes  │ ┌──────────────────────────────────┐ ├───────────────────────────┤
  │ • Settings  │ │ Card: meta-llama/Llama-3.3-70B   │ │ Hardware Fit & VRAM Meter │
  │             │ │ Downloads: 1.2M | Likes: 14k     │ ├───────────────────────────┤
  │             │ │ Available: Q4_K_M, Q8_0, FP16    │ │ Purpose Settings Box      │
  │             │ └──────────────────────────────────┘ │ [Instruct] [Reason] [Code]│
  │             │ ┌──────────────────────────────────┐ ├───────────────────────────┤
  │             │ │ Card: Qwen/Qwen2.5-Coder-32B     │ │ Target Runtime Selector   │
  │             │ │ ...                              │ │ ( ) Ollama   (•) llama.cpp│
  │             │ └──────────────────────────────────┘ ├───────────────────────────┤
  │             │                                      │ [  Install Model (19.8 GB) ]│
  └─────────────┴──────────────────────────────────────┴───────────────────────────┘
  ```

### 7.2 Accessibility & Ergonomics
- High contrast themes compatible with Windows High Contrast mode.
- Full keyboard tab navigation with visible focus rings.
- ARIA live regions for background download progress notifications.

---

# 8. Complete Step-by-Step Implementation Runbook

### Phase 1: Core Scaffolding & Native Windows Hooks
- **Step 1.1:** Initialize Tauri v2 workspace with Rust 2021 edition and React 19 TypeScript frontend.
- **Step 1.2:** Configure `tauri.conf.json` with secure window permissions, file system scopes, and HTTP client permissions.
- **Step 1.3:** Implement Rust hardware sensor module in `src-tauri/src/hardware/`:
  - Bind `dxgi.dll` to query GPU memory.
  - Dynamically load `nvml.dll` via `libloading` to query NVIDIA VRAM and temperature without compile-time failure on AMD/Intel systems.
  - Implement system RAM and CPU cores detection using `sysinfo` crate.
- **Step 1.4:** Create type-safe Tauri commands exposing hardware stats to frontend: `get_system_specs()`.

### Phase 2: Runtime Adapter Core Implementation
- **Step 2.1:** Implement `llama.cpp` Adapter (`src-tauri/src/adapters/llamacpp.rs`):
  - Scan system PATH and standard directories (`%LOCALAPPDATA%\llama.cpp`, `%USERPROFILE%\llama.cpp`, custom user path) for `llama-server.exe` and `llama-cli.exe`.
  - Implement probe check: Execute `<binary> --version` with timeout of 1500ms.
  - Implement API probe on default port 9931: `GET /health`.
  - Build command line generator for `llama-server.exe` with precise model path, context size, offload layers, and binding constraints.
- **Step 2.2:** Implement `Ollama` Adapter (`src-tauri/src/adapters/ollama.rs`):
  - Check TCP port 11434 (`http://127.0.0.1:11434/api/version`).
  - Scan for `ollama.exe` in `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`.
  - Implement native manifest pull API (`POST /api/pull`) and Modelfile GGUF creation API (`POST /api/create`).
- **Step 2.3:** Implement `xollama` Adapter (`src-tauri/src/adapters/xollama.rs`):
  - Check TCP port 22434 (`http://127.0.0.1:22434/api/version`).
  - Scan for `xollama.exe`.
  - Validate SHA256 checksum of downloaded binary against GitHub release manifest before suggesting installation.
  - Detect opencoti engine capabilities and flag tokenization and think-budget features.
- **Step 2.4:** Implement `vLLM` Adapter (`src-tauri/src/adapters/vllm.rs`):
  - Probe local network port 8000 (`/v1/models` and `/health`).
  - Probe WSL2 environment: Execute `wsl.exe -l -v` and probe for `vllm` CLI inside default WSL2 distro.
  - Construct safe `vllm serve` argument payload.
- **Step 2.5:** Implement URAS Manager:
  - Central registry that runs detection across all adapters concurrently on app startup and maintains active runtime health statuses.

### Phase 3: Hugging Face API Client & Search Pipeline
- **Step 3.1:** Implement authenticated HF Hub client in Rust (`src-tauri/src/hf_client/`):
  - Support `HF_TOKEN` from Windows Credential Vault.
  - Support pagination and token-bucket rate limiting with backoff.
- **Step 3.2:** Implement Artifact Tree Parser:
  - Parse siblings tree to identify all GGUF variations, shards, and safetensors files.
  - Compute checksums and file sizes.
- **Step 3.3:** Frontend Search Interface:
  - Search input with debounce (300ms).
  - Multi-select filters for quant formats (`Q4_K_M`, `Q8_0`, `FP16`, `AWQ`, `GPTQ`, `FP8`).
  - Sort by Trending, Most Downloads, Most Likes, Recently Updated.

### Phase 4: Model Detail Drawer & Purpose Recommendations
- **Step 4.1:** Model Details Component:
  - Slide-out right sidebar displaying README model card (sanitized Markdown with no script execution).
  - Display tags: License, Base Model, Pipeline, Architecture, Gated Access status.
- **Step 4.2:** Purpose-Specific Setting Box:
  - Radio toggle between: "Instruct / Conversational", "Reasoning / Deep Thinking", "Coding / Mathematics", "Creative / Freeform".
  - Reactive display showing recommended Temperature, Top-P, Min-P, Repeat Penalty, and Thinking Token Budget.
  - Settings explanation banner citing recommendation source (e.g. "Derived from model creator's official configuration file").
- **Step 4.3:** Real-time VRAM Fit Indicator:
  - Live bar chart comparing Estimated Model Footprint vs Free VRAM.
  - Clear indicator badges: `100% GPU Offload (Optimal)`, `Partial CPU Offload (Slower)`, `OOM Warning`.

### Phase 5: Installation Orchestrator & Safe Downloader
- **Step 5.1:** Robust Chunked Resumable Downloader:
  - Rust downloader writing to `.part` files with pause/resume support (`Range: bytes=X-` HTTP headers).
  - Verify SHA256 / SHA1 against Hugging Face metadata where provided.
- **Step 5.2:** Execution Engine:
  - Create model manifest for target runtime.
  - Provide non-blocking download updates to frontend via Tauri event channel (`emit("download_progress", payload)`).
- **Step 5.3:** Verification Hook:
  - Once file is registered, dispatch a lightweight inference request (`{"prompt": "Hello", "max_tokens": 1}`) to the serving runtime to verify model weights load into memory without kernel panics or driver crashes.
  - Report latency and confirm successful installation.

---

# 9. Verification, Smoke Testing & Hardening Matrix

### 9.1 Security Hardening
- **Path Traversal Prevention:** Target file paths are sanitized and restricted to designated storage roots.
- **Shell Injection Immunity:** Process execution uses typed parameter arrays (`std::process::Command::new(bin).args(&["--arg", val])`); raw shell interpretation (`cmd.exe /C` or `sh -c`) is strictly forbidden.
- **Model Card Webview Isolation:** Rendered model card Markdown strips all `<script>`, `<iframe>`, `object`, and inline event handlers (`onload`, `onerror`).

### 9.2 Automated Verification Test Suite
1. **Mock Hugging Face Test:** Verify that GGUF siblings with missing `Q4_K_M` quant do not trigger false positive fallbacks.
2. **Sharded GGUF Resolution Test:** Feed a sibling list containing 4 shards (`00001` through `00004`) and assert all 4 files are scheduled for download in correct sequence.
3. **Hardware Math Test:** Assert that a 70B Q4_K_M model (~43 GB) on an RTX 4090 (24 GB) correctly calculates a partial offload plan with exactly the maximum possible layers that fit into 20 GB of usable VRAM.
4. **Adapter Isolation Test:** Run simultaneous mock calls to Ollama (11434) and xollama (22434) and confirm that ports, endpoints, and environment variables remain completely isolated.
5. **Cancellation Test:** Trigger a multi-gigabyte download, cancel at 25%, verify file handle is closed, partial `.part` file is cleanly preserved or deleted per user preference, and system memory is reclaimed.

---
*End of Master Plan & Specification.*

---

# 10. Implementation Control Rules: No Guessing, No Hidden Assumptions

This section governs every execution of the plan above. It supersedes any overly certain or version-independent statements earlier in the document. All runtime behavior, API details, parameter defaults, platform support, and package behavior must be verified against the versions actually targeted. A plan item is not implementation authorization to invent missing behavior.

## 10.1 Mandatory assumption protocol

For each work item, the responsible implementer must write a short preflight in the task description or PR containing:

1. **Objective:** one observable user-visible behavior to implement.
2. **Inputs:** concrete fixtures, runtime version, platform, sample HF repository and revision, or a statement that the work is isolated behind an interface.
3. **Known facts:** cite repository code, official documentation, or existing tests, with version and access date for external facts.
4. **Unknowns:** list unresolved matters explicitly. Never silently choose a value for a security, compatibility, licensing, data-loss, or user-experience question.
5. **Decision owner:** product owner for product tradeoffs; architecture owner for internal technical choices within approved constraints; security owner for security behavior; runtime maintainer for adapter-specific quirks.
6. **Default when blocked:** keep the capability disabled or mark it `unknown`/`experimental`; do not create a compatibility promise.
7. **Definition of done:** file/behavior changes, tests, verification commands and expected result.
8. **Rollback:** how to revert or disable the feature without deleting user data.

When information is missing:
- Non-consequential local implementation choice: select the simplest reversible option, document it in an ADR, and continue.
- External API/version/platform behavior: research official docs and executable behavior before implementing.
- Destructive, privacy, license, credentials, external side effect, network exposure, or unsupported-runtime decision: stop that work item and request a product/security decision; continue independent work only.
- Do not ask the user to decide implementation details already settled by an accepted ADR.

## 10.2 Decision log and assumptions ledger

Maintain these project artifacts once implementation begins:

- `docs/plan/implementation-plan.md`: this master plan, kept current.
- `docs/architecture/adr/ADR-0001-desktop-stack.md`: result of framework spike.
- `docs/architecture/adr/ADR-0002-runtime-adapters.md`: trusted adapter boundary and extension policy.
- `docs/architecture/adr/ADR-0003-artifact-identity.md`: repository/revision/file identity and conversion relations.
- `docs/architecture/adr/ADR-0004-compatibility-evidence.md`: support verdict vocabulary and evidence expiry.
- `docs/architecture/adr/ADR-0005-hardware-estimates.md`: estimate methodology, limitations and calibration data.
- `docs/research/runtime-matrix.md`: per-runtime versioned capability matrix with citations.
- `docs/research/open-questions.md`: unresolved claims with owner, evidence needed and due phase.
- `docs/security/threat-model.md`: assets, trust boundaries, attacker controls, mitigations and residual risks.
- `docs/testing/verification-matrix.md`: test claims, owners, commands, fixtures and expected output.

These files belong in the project repository if one is available. This session's plan document is stored separately at `C:\\Users\\Chris\\.opencode\\plan\\hf-browser-master-plan.md`.

Every ledger row has: `ID`, `claim/question`, `affected feature`, `evidence/source`, `version/date`, `confidence`, `owner`, `next action`, `blocks release?`, and `resolution`. A claim without evidence stays `unknown`; expiration of source or compatibility tests changes it back to `unknown` until reverified.

## 10.3 Source-of-truth hierarchy

For runtime facts, use sources in this order:

1. Official stable documentation for the exact version.
2. Official release notes/changelog for that version.
3. Official source code or API schema at a pinned release commit.
4. Reproducible integration tests against that version.
5. Maintainer statements/issues, labeled as such.
6. Community evidence, clearly labeled unverified.

`latest`, `main`, preview, nightly, and developer-preview documentation must not establish stable product claims. Pin the URL/commit/release, date accessed, and relevant section. Recheck high-change capability data at each release.

Each fact in UI or compatibility output has one evidence label:

- `Verified on this setup`
- `Tested for listed runtime version`
- `Documented for listed runtime version`
- `Inferred from metadata`
- `Community-reported`
- `Unknown`

Do not collapse these categories into an unqualified green checkmark.

## 10.4 Accuracy corrections and version gates

The earlier sections contain candidate observations, not a substitute for research:

- Any precise default (ports, context size, quant selection, memory utilization, endpoint behavior) must be confirmed for the detected release. Use defaults as detection hints only, never as hardcoded truth.
- llama.cpp's documented Hugging Face selection fallback must be tested against the selected release. In all cases the app must select and display an exact file/revision, rather than rely on implicit fallback.
- The GGUF quant taxonomy is not a filename-only guarantee. Names are parsed as candidate evidence; where reliable container metadata is available, inspect it. Keep `name-derived`, `metadata-confirmed`, and `unknown` distinct.
- QAT describes a training/quantization technique and may not identify a unique inference file encoding. `GSQ-RCO` and uncommon labels require a definition/source before they are promoted to standardized facets.
- Sampling values in Section 5 are illustrative presets only. Do not ship them as universal recommendations. Launch with model-author settings where traceable; otherwise label general presets as editable starting points, and validate on an explicit evaluation set before recommending them.
- KV-cache storage precision is not always a simple exact bytes-per-element multiplier; alignment, block scales, runtime-specific cache layout, architecture, batching, sequence count, and allocator overhead matter. The formula in Section 6 is a lower-level estimator component, not a promise of exact fit.
- Disk file size, weight memory, resident memory, and total VRAM requirement are different quantities. Never present a fixed padding factor or universal CUDA overhead as exact. Provide ranges and calibrated error bars.
- A one-token inference request proves only that a request completed for a particular configuration. It does not prove full context, modality, concurrency, tools, license compliance, production reliability, or quality. Name the exact verification that passed.
- A checksum proves equality to a checksum source, not publisher identity or artifact safety. Verify transport, provenance/signature where available, and explain limits.
- Do not use `--tools`, arbitrary model code, repository scripts, MCP servers, or remote-code execution as part of installation. Such features are separate opt-in product surfaces with separate threat models and tests.
- Runtime name and port do not establish identity. A user can configure non-default ports; ports can be reused. Confirm with version/health/API signatures and let users label manually configured endpoints.

---

# 11. Subagent Orchestration Protocol for Plan Execution

Subagents are used during implementation because the work has separable research, UX, and integration tracks. The primary agent remains responsible for integration, safety, resolving conflicts, acceptance criteria, and final verification. Delegation does not transfer product decisions or authorize an agent to change scope.

## 11.1 Roles and work boundaries

Use only the available specialist roles appropriate to a bounded task:

### Explorer: research and repository reconnaissance
Assign:
- Official documentation and exact-version capability research.
- Existing codebase structure, conventions, tests, and integration points.
- Runtime API/version behavior investigation.

Explorer must return:
- Exact question answered.
- Official source URLs plus release/version and access date.
- Findings separated into verified fact, inference, and unresolved issue.
- Minimal executable or documented reproduction where useful.
- Proposed changes to the capability matrix, not implementation unless explicitly asked.

Explorer must not:
- Claim tested behavior without running or citing a test.
- Treat blogs/community posts as official guarantees.
- choose licensing, security, privacy, or product scope.
- modify files outside its assigned research notes.

### Designer: experience and visual system
Assign:
- Interaction flow, component specification, accessibility review, wireframes/prototype or UI changes.
- Search/detail/install/job/runtime management UX.

Designer must return:
- User goals and step-by-step flows.
- Component states including loading, no results, API failure, unsupported, unknown, conflict, cancellation, and stale metadata.
- Responsive/resizable behavior, keyboard flow, screen-reader labels, contrast, and motion behavior.
- Design tokens/patterns aligned with approved architecture.
- No hidden assumptions about runtime capabilities or unsupported product behavior.

Designer must not:
- Invent compatibility outcomes, default settings, or runtime parameters.
- present uncertain estimates as exact.
- change security confirmations to frictionless defaults.

### Fixer: bounded implementation
Assign:
- One independently testable feature with explicit interfaces, files/scope, acceptance tests, and no open product choices.
- Adapter work only after research record and adapter contract are approved.

Fixer must return:
- Files changed and concise summary.
- Tests added/changed and commands/results.
- Known limitations and assumptions.
- Any scope deviation before broadening it.

Fixer must not:
- modify shared contracts without coordination.
- make unrelated refactors.
- execute destructive operations, install runtimes, modify user services, or use real credentials without explicit permission.
- mark unknown external behavior supported.

### Oracle: architecture and tradeoff review
Assign:
- Review proposed architecture/ADRs, compatibility/evidence model, security boundaries, and sequencing.

Oracle must return:
- Decision alternatives and tradeoffs.
- Failure modes, integration risks, and recommendation.
- Explicit distinction between known evidence and assumptions.
- No code or product decision unless the user/primary agent accepts the recommendation.

## 11.2 Delegation start checklist

Before spawning any subagent:

1. Confirm the relevant repository and working tree. Do not assume the current `ollama-hf-browser` folder contains a Git repository; inspect it first when implementation starts.
2. Read repository guidance (`AGENTS.md`, contribution docs, package scripts) and identify user modifications.
3. Assign a bounded task with one owner and one output.
4. Provide relevant paths, existing contracts, scope boundaries, research cutoff/version requirements, and acceptance tests.
5. State that the agent must not edit unrelated files, make external state changes, or commit/push.
6. For shared files, assign one writer only. Parallelize research/design, not concurrent edits to the same contract or file.
7. Ask for progress only at meaningful milestones; do not create redundant work.
8. Keep all changes in the user's current worktree unless a worktree is explicitly created and session moved under the worktree workflow.

## 11.3 Integration protocol

For each delegated result:

1. Inspect the full result and the actual diff/files; do not merge based only on the summary.
2. Compare implementation to task acceptance criteria and product/security invariants.
3. Run the delegated tests independently in the primary context.
4. Resolve conflicting findings by returning to official docs or a reproducible test; do not average conflicting answers.
5. Update the runtime matrix, assumptions ledger, and tests when behavior is version-specific.
6. Reject or revise unsupported claims, guessed defaults, extra scope, unreviewed dependencies, and unsafe commands.
7. Only the primary agent integrates work and reports the final claim and evidence.

## 11.4 Parallelization map

Parallel tracks are permitted only where interfaces are stable:

- **Track R1 (Explorer):** llama.cpp stable-version behavior and artifact/shard/projector cases.
- **Track R2 (Explorer):** Ollama and xollama release/API/install differences; compare shared behavior with tests.
- **Track R3 (Explorer):** vLLM platform, stable release, format/quantization, chat-template and GPU requirements.
- **Track R4 (Explorer):** Hugging Face Hub API, file metadata, auth/gating, rate limits, revision and download semantics.
- **Track D1 (Designer):** search → details → compatibility → install preview UX based only on approved evidence labels.
- **Track A1 (Oracle):** review adapter contract, plugin security boundary, and evidence model.

Primary agent consolidates these into the research matrix and settles the common schema before implementation. After the schema is accepted, bounded Fixer tasks can implement independent adapters in separate modules. All shared model types, install plan types, and UI capability components have a single designated owner at a time.

## 11.5 Subagent stop conditions

Stop delegation and escalate to the primary agent if:
- A runtime's official docs contradict behavior or docs are only preview/nightly.
- An action requires credentials, a license acceptance, system install, service stop/restart, network exposure, or destructive model deletion.
- The exact xollama release/engine/platform differs from tested evidence.
- Windows native versus WSL2/container support cannot be established.
- A suggested dependency expands attack surface or license obligations.
- Two tracks need to edit the same central interface.

---

# 12. Expanded Completion-Ready Work Breakdown

Each numbered work item below is independently checkable. Dependencies must be satisfied in order; do not skip a gate simply because a mock passes.

## Workstream 0 — Repository and project baseline

**Owner:** Primary agent. Explorer may inspect independently after access is verified.

1. Inspect current directory, Git status, tracked/untracked files, project docs, package manifests, and test commands.
2. Preserve existing changes; do not reset, overwrite, or delete user work.
3. If no project repository exists, report that and request or create a project only when authorized; the master plan alone does not imply creating code files.
4. Record OS target, minimum Windows version, supported CPU architectures, whether WSL2 is an optional integration, and expected supported install packaging.
5. Create project-level research/ADR/test docs only after implementation context exists.

**Acceptance:** baseline inventory report lists repository state, project stack, test/build commands, and user changes. No files altered in reconnaissance.

## Workstream 1 — Research packets

**Owner:** Explorer subagents by runtime/hub; primary agent reviews.

For each runtime, investigate the full research record in Section 10.2. Each packet must include:

1. Stable release(s) to support initially, chosen based on current release cadence and testability.
2. Supported OS, architecture, installation origin, launch/service model, process names, custom data dirs.
3. Detection signals and false-positive risks.
4. Exact health/version/model-list endpoints and auth requirements.
5. Every artifact format and architecture requirement relevant to proposed Hub catalog.
6. Native and partial API compatibility, streaming framing, error model, and settings mapping.
7. Model install/import semantics with exact parameters and cancellation behavior.
8. User-facing failure cases and remediation.
9. Security/privacy constraints and dangerous capabilities.
10. At least one small real model and one edge-case fixture.
11. All claims cited to version-pinned official docs/release/source and test evidence.

Research packets must specifically settle:
- llama.cpp: `-hf` quant/file selection, first-file fallback, `--hf-file`, shard naming and missing-shard behavior, mmproj relation, server health/loading response, actual executable names and supported backends.
- Ollama: current Hub reference syntax if any, local GGUF import, Modelfile creation, progress/error streams, context settings, show/tags/version APIs, API capability differences.
- xollama: pinned release/tag, version API identity, port/host configuration, Windows and container paths, shared-store behavior, engine routing and selection, release checksum source, extra APIs/capability versioning.
- vLLM: stable-version Windows native support status; tested WSL2/container support requirements; model support backend; format/quant/hardware matrices; chat template; auth and remote-code behavior; memory controls.
- Hugging Face: search/list parameters, model detail expansions, tree API pagination, gated auth, signed/redirected download URLs, ETag/revision/hash facts, rate-limiting and cache.

**Gate:** primary agent signs off research packets and updates uncertainty ledger before implementation starts.

## Workstream 2 — Stack spike and ADR

**Owner:** Primary agent, with Designer/Explorer input and Oracle review.

Implement temporary throwaway spikes (do not merge into production until selected):

1. A window with native titlebar, Mica/background, dark/light modes, and keyboard navigation.
2. A screen-reader accessible search/results/detail prototype.
3. Safe native process launch and cancellation.
4. HTTPS resumable download with pause/cancel.
5. Credential storage and retrieval through OS protection.
6. Signed packaging and update prototype.
7. WSL2/docker endpoint detection prototype if vLLM is in initial support.
8. CI build/test on clean Windows VM.

**Gate:** score candidates with the rubric and approve ADR. Delete throwaway code only after checking its ownership and preserving any reusable work.

## Workstream 3 — Domain model and adapter API

**Owner:** Primary agent; Oracle review; Fixer only after review.

Define typed entities before adapters:

- `HubRepositoryId`: namespace/name.
- `HubRevision`: immutable commit hash plus display ref.
- `HubFile`: path, size, LFS OID/hash where provided, media type, last commit, download URL resolver.
- `Artifact`: file or complete shard group plus role (`weights`, `projector`, `tokenizer`, `adapter`, `config`, `unknown`), format, quant label and evidence.
- `RuntimeInstallation`: runtime ID, detected version, distribution, executable/endpoint, configured data paths, health state, evidence timestamp.
- `CapabilityEvidence`: capability, verdict, scope (runtime/version/platform/hardware/artifact), source, checked time, confidence, test ID.
- `CompatibilityReport`: verdict, blockers, warnings, required actions, estimate range, evidence IDs.
- `InstallPlan`: immutable reviewed list of exact effects; includes runtime, exact repository/revision/file IDs, destination, bytes, settings, network/process/API actions, cleanup plan, and verification.
- `InstallJob`: persisted state machine and redacted logs.
- `Recommendation`: purpose, parameter values/ranges, source and confidence, runtime mapping, warnings.

Adapter methods must be asynchronous, cancellable, timeout-bounded, and typed. Replace `any`, generic `Record<string, any>`, and boolean-only install returns in the existing illustrative interface with schema-validated types before production use.

**Gate:** contract tests can run against a fake adapter and validate every state, error category, event, cancellation, and serialized plan.

## Workstream 4 — Hugging Face and artifact pipeline

**Owner:** Hub client Fixer; parser Fixer; primary integration. One owner per source file.

1. Implement public search and typed pagination.
2. Add optional token retrieval from OS vault; never store token in renderer state/local storage/logs.
3. Retrieve model card, tags, config/tokenizer metadata, repository revision and file tree using documented current Hub endpoints.
4. Support private/gated repos; show sign-in and license acceptance status without attempting to accept terms for the user.
5. Resolve download URLs just-in-time; do not persist expiring signed URLs as model identity.
6. Identify formats from file extension plus metadata; do not execute or deserialize untrusted pickle files.
7. Resolve GGUF shards by exact filename pattern and verify all expected shard indexes are present; preserve arbitrary shard naming as unknown/manual review.
8. Treat `mmproj` as a related artifact only when evidence indicates it corresponds to selected weights.
9. Parse quant filename labels as candidates; do not claim a particular actual quant without artifact metadata or documented publisher evidence.
10. Build indexed/local cache and freshness/revalidation policy.
11. Add robust retry for 429/5xx/network interruptions with backoff and `Retry-After`; prevent duplicated concurrent downloads.

**Acceptance:** fixture tests include missing metadata, malformed filenames, duplicated shards, sparse indexes, a gated repo, private repo auth failure, redirect, expired URL, API rate limit, huge repository, and non-HF-compatible endpoint.

## Workstream 5 — Runtime detectors (read-only first)

**Owner:** Runtime-specific Fixers, each in separate adapter files; primary agent handles shared contract.

1. Probe known API endpoints with strict timeout and loopback-first policy.
2. Check runtime-specific version and health signatures; avoid identifying runtime by port alone.
3. Discover executables via PATH, OS service/app metadata, and user-configured paths; do not recursively scan arbitrary disks.
4. Do not run shell command strings. Spawn known executable with arguments as separate parameters; cap output, time, and environment.
5. Detect custom endpoint separately from local executable and show endpoint owner label.
6. Report installed vs reachable vs healthy vs model-loaded states separately.
7. Make detection opt-out/manual and re-run on demand; do not modify services or launch runtimes in detection stage.
8. Add duplicate-runtime and port-conflict handling.

**Acceptance:** detector false positives tested with a mock HTTP server on the same port, wrong-version server, auth-required endpoint, loading endpoint, redirect, and malformed response.

## Workstream 6 — Compatibility and recommendation logic

**Owner:** Primary agent owns common evaluation; Explorer supplies evidence; adapter Fixers implement runtime specifics.

1. Build decision order: repository/revision exists → artifact complete → format supported → architecture/backend supported → quant/hardware supported → auth/license prerequisites → resource estimate → optional real load test.
2. Any unmet known requirement gives `unsupported`; requirement dependent on missing facts gives `unknown` or `conditional`, never `supported`.
3. Resource estimate yields interval and assumptions, not exact pass/fail certainty.
4. Preserve runtime-specific settings separately from common conceptual settings.
5. Settings that a runtime ignores or maps differently are shown explicitly.
6. Do not turn thinking tags on/off with stop sequences without testing that this preserves intended output.
7. Use HF model-card recommendations only when source and revision are recorded. Generic presets are labeled as editable starters, not model-specific recommendations.
8. Add evaluation datasets and deterministic comparisons before claiming recommendation quality.

**Acceptance:** table-driven tests cover every verdict and evidence confidence; property tests ensure missing evidence cannot result in `supported`.

## Workstream 7 — UX implementation

**Owner:** Designer produces flow/spec; one frontend Fixer implements approved designs; primary agent integrates.

Required screens and states:

1. First-run welcome/privacy notice, no telemetry default, storage choice.
2. Runtime detection summary with manual add endpoint.
3. Search landing, advanced filters, active-filter chips, sort controls, search errors, no results, stale cache.
4. Results cards with repository identity and concise artifact/runtime indicators.
5. Right-side model details panel with sanitized model card, file browser, license/gating status, and exact revision.
6. Runtime compatibility matrix with reasons and evidence labels.
7. Purpose presets and runtime-supported setting editor.
8. Install review sheet with exact artifacts, versions, paths, side effects, estimated bytes, and confirmation.
9. Jobs center with pause/resume/cancel, log export, retry, and verification outcomes.
10. Installed models, shared-store caveat, launch/health details, safe removal with explicit confirmation.
11. Runtime manager, adapter support level, version, endpoint, last-check time, and status.
12. Settings, credential manager, cache management, accessibility, themes, privacy, update policy.

Accessibility acceptance: keyboard-only end-to-end install flow; screen-reader names/status; high contrast; 200% scaling; reduced motion; no progress conveyed by color alone.

## Workstream 8 — Installation and deployment

**Owner:** Runtime-specific Fixer. Primary agent reviews exact plan and side effects.

1. Generate an immutable install preview before any write/network mutation.
2. User confirms exact repo, commit, file list, destination, runtime target, resource options, and side effects.
3. Store an idempotency key and job record before starting. Prevent duplicate install when user double-clicks/retries.
4. Download to controlled temporary file or runtime-managed location; use HTTP range only after verifying server supports it and ETag/revision matches.
5. Validate size and checksum against trustworthy metadata where available. Explicitly label absent checksums.
6. Atomically move completed artifacts where filesystem semantics permit; preserve/clean partial files based on user preference.
7. Invoke runtime through documented API/CLI in its tested environment.
8. Stream progress; if runtime offers no progress, show honest indeterminate phase and do not fabricate percent.
9. Cancellation stops requests/process and records which artifacts remain. Never kill a user-owned daemon unless user specifically confirmed.
10. Verify runtime inventory; optional smoke test uses the smallest documented test for the task and explicitly states its limited scope.
11. Provide recovery action and redacted diagnostics for each error class.
12. Store install metadata, repository commit, artifact hashes, runtime/version, settings profile, and verification result.

**Acceptance:** simulated crash, app shutdown, sleep/resume, interrupted network, disk full, path permission error, runtime shutdown, stale signed URL, and duplicate retry do not corrupt or misreport state.

## Workstream 9 — Broad runtime onboarding

To add any future runtime:

1. Submit an onboarding proposal: demand, authoritative docs, license, maintainer activity, platforms, API, artifacts, security posture.
2. Complete the research packet and a minimum test fixture.
3. Implement a detector and read-only model inventory first.
4. Add capability/evidence data; do not add install actions until detect/inventory are stable.
5. Implement compatibility evaluator and explainable result.
6. Implement install plan/execute/verify with no-op preview and cancellation.
7. Run adapter contract tests and real smoke matrix.
8. Mark `experimental` until stable support matrix passes; publish known limitations.
9. Review update process, security contact, and release compatibility.

Broad support means many independently validated adapters, not assuming that OpenAI-compatible endpoints all have identical semantics. Add a `Custom OpenAI-compatible endpoint` mode for generation/testing only; do not promise install management through generic endpoints.

---

# 13. Phase Gates, Deliverables, and Definition of Done

Every phase ends with a review. Do not start downstream work whose inputs are still unsettled.

## Gate A — Evidence and product scope
Deliver:
- Current runtime research records (five initial targets plus Hub).
- Version/platform matrix.
- Assumptions/unknown ledger.
- Product capabilities list and excluded scope.

Pass condition: every initial runtime has exact detection/install/verification path or is explicitly classified as endpoint-only/experimental.

## Gate B — Architecture
Deliver:
- Approved stack ADR.
- Threat model and data-flow diagram.
- Adapter/domain model contract.
- Data persistence and migrations plan.
- Update/signing plan.

Pass condition: no credentials enter renderer or logs; no model card can invoke privileged APIs; install effects are previewed and user-approved.

## Gate C — Search and read-only runtimes
Deliver:
- Search, filters, file listing, details panel.
- Runtime detection and inventory.
- Evidence-based compatibility labels.

Pass condition: unknown information stays unknown, and existing runtime installations are unchanged.

## Gate D — Install on first runtime
Deliver:
- One complete tested adapter flow from discovery through verification.
- Job lifecycle and recovery.
- Security review.

Pass condition: successful install and failure/cancel tests on a clean supported environment.

## Gate E — Initial runtime set
Deliver:
- llama.cpp, Ollama, xollama, vLLM adapters or explicit documented exclusions.
- Version-scoped support matrix and visible experimental labels.

Pass condition: no runtime is called supported without integration tests.

## Gate F — Release candidate & Code Signing Strategy
Deliver:
- Signed Windows installer (NSIS or MSIX via Tauri v2 bundler), update/rollback mechanism, privacy and licensing disclosures, support diagnostics, accessibility report, performance report.
- **Code Signing & SmartScreen Strategy:**
  - **Development / Local Test Builds:** Use standard self-signed test certificates (`New-SelfSignedCertificate -Type CodeSigningCert`) imported into `Cert:\LocalMachine\TrustedPublisher` for testing clean-install pipelines without SmartScreen blocks on developer machines.
  - **Production Distribution:** Build pipeline integrates Microsoft Azure Trusted Signing (formerly Azure Code Signing) or an EV Code Signing Certificate via SignTool:
    `signtool.exe sign /v /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /d "HF Browser" <target_installer.exe>`
  - Verify that the executable publisher name matches the corporate release identity and that SmartScreen reputation is tracked prior to general availability.

Pass condition: clean-machine install, upgrade, interrupted update, uninstall, and recovery are tested; all release claims link to evidence; installer is dual SHA256 signed.

### Global definition of done for a feature

- User-visible acceptance criteria are met.
- Tests establish the intended behavior and meaningful boundary cases.
- Relevant docs, source evidence, capability matrix and limitations are updated.
- Security/privacy/design review has no unresolved release-blocking issue.
- No new dependency without version, license, maintenance, and security review.
- Build, lint, typecheck, unit, adapter contract, and relevant integration tests pass.
- Logs redact secrets; error messages explain action and recovery.
- User changes and unrelated files are preserved.
- Final status distinguishes facts verified from unknowns.

---

# 14. Verification Commands and Evidence Capture Template

At project bootstrap, replace placeholders below with the actual repository package scripts; do not guess commands. Add exact commands and expected outputs to `docs/testing/verification-matrix.md`.

For each PR, capture:

1. `git status --short` (confirm scope and no unrelated changes).
2. Formatting and lint command(s).
3. Typecheck/build command(s).
4. Unit test command(s) and summary.
5. Adapter contract test command(s) and summary.
6. Runtime smoke test name, exact runtime version, OS/backend, artifact revision, result, and limitation.
7. Security-sensitive tests and outcomes.
8. Manual accessibility checks when UI changes.
9. Final diff review and changed-file list.

If a test cannot run due to missing credentials, hardware, runtime, or external service, record it as **not run** with reason; never state it passed. Use mocks for deterministic contract coverage, but do not treat mocks as evidence of real runtime behavior.

---

# 15. Plan Execution Instructions to the Future Implementing Agent

1. Read this entire file, repository instructions, and current repo status before editing.
2. Begin with Workstream 0; do not scaffold until repository context is known.
3. Use subagents according to Section 11: delegate bounded, independent research and UX/review tasks; never delegate unresolved product/security decisions.
4. Run parallel research only when tasks do not conflict. Give each runtime to one researcher, require cited version-scoped results, and have the primary agent reconcile.
5. Do not let multiple agents edit shared contracts or the same files concurrently.
6. Keep implementation changes in one designated worktree. Do not commit, push, install services, accept licenses, use credentials, or alter system runtime state unless specifically authorized.
7. Follow phase gates in order. If a gate fails, fix or document the blocker rather than bypassing it.
8. For every external claim, prefer current official documentation and source; cite actual version and revalidate. Context-dependent docs must be consulted at implementation time.
9. Write durable plans/ADRs only inside the project (and only after confirming project root), except this master plan which lives at the approved plan path.
10. At each turn, report progress, files changed, evidence/tests run, unresolved issues, and the next bounded phase. Do not mark the full goal done until Gate F passes or list remaining unmet gates explicitly.

*End of Master Plan & Specification (revision 3.0.0).*

---

# 16. Hugging Face Account Login, Access Tokens, and Gated Models

## 16.1 Product requirement

Users must be able to browse gated/private Hub repositories they are authorized to access and deploy their files into a selected runtime. Support both:

1. **Hugging Face account login in the app**, using Hugging Face's documented OAuth flow for a registered public application. Official documentation describes native-app use, device authorization, authorization-code with PKCE, and loopback redirects. The product must register/configure its own OAuth application before release.
2. **Manual User Access Token entry** as the dependable fallback and as an explicit advanced option.

Do not invent a Hugging Face password-login flow, scrape browser cookies, automate a web login form, or ask users to paste their account password. Do not reuse another application's OAuth client ID. Register and configure this product's own public OAuth application, then verify the current Hub documentation and the registered application's allowed flows/scopes before implementation. OAuth is the preferred native-app login path; manual User Access Token entry remains a fallback.

The “access key” terminology in UI/help text should be clarified as **Hugging Face User Access Token**. Do not call it an API key if Hugging Face’s current product documentation uses a different name.

## 16.2 Authentication flows

### Flow A: Hugging Face OAuth login (preferred)

1. User selects **Connect Hugging Face account**.
2. App opens the system browser to the official Hugging Face authorization page using the registered public application's documented native-app flow. Choose device authorization or authorization-code with PKCE according to the current official docs and product registration; do not assume a client secret can be safely embedded in a desktop application.
3. Request only scopes needed for the selected feature. For reading/downloading a gated repository, request `gated-repos` where required by the current OAuth scope documentation. Request `request-gated-repos` only when the user explicitly initiates an access request and the product implements that action. Do not request access-request scope merely to browse or download.
4. Use a random, single-use state value and PKCE for authorization-code flow; validate state/redirect origin and reject replay. For device authorization, validate the device flow response and expiration/polling interval as documented.
5. User authenticates and grants only the requested permissions on Hugging Face's own site. The user remains responsible for publisher terms and gated-repository approval; OAuth consent does not accept those terms or grant publisher approval.
6. For authorization-code flow, receive the result using the registered/documented loopback callback or OS-supported redirect. Bind loopback callbacks to `127.0.0.1` only, use a short-lived random port/state, and close the listener after completion. For device flow, display the official verification instructions and poll only as documented.
7. Exchange authorization result only through the documented token endpoint and only in the native backend, not the webview.
8. Store the resulting token using Windows Credential Manager/OS-protected credential APIs; store only a non-secret account display name/subject and token metadata in local app state.
9. Validate the session by querying a documented low-impact identity endpoint. Never print the token or include it in telemetry, crash reports, support bundles, analytics, command-line arguments, or process environment unless a specific runtime requires it and the user has explicitly selected that transfer path.
10. Show connected identity, granted scopes/expiry when available, last validation time, and a **Disconnect** action.
11. If authorization fails, show a user-actionable error and leave no partial credential stored.

**Acceptance:** fake callback tests reject state mismatch, expired callback, replay, wrong origin, malformed response, token-exchange failure, and cancellation; real test uses an application registration approved for this flow.

### Flow B: Manual token entry

1. Present a secure token dialog with instructions to create a Hugging Face User Access Token in the official account settings.
2. Recommend the minimum read/fine-grained permissions required for the selected workflow. For gated repositories, explain that the user must already have been granted access and token scope must permit reading the repository. Hugging Face documents `gated-repos` for OAuth gated-repository access and a separate `request-gated-repos` permission for submitting access requests; a `read` User Access Token cannot submit gated access requests. Do not imply that a token or scope grants publisher approval.
3. Provide paste input with reveal/hide toggle, no clipboard-read permission, and an option to clear the clipboard only if the user explicitly requests it.
4. Send token only from the native backend over HTTPS to a documented identity/access check. Do not include raw token in URL, shell command, crash context, logs, UI error text, local database, or frontend persistent storage.
5. On successful validation, save in OS-protected credential storage. On failure, do not persist it; explain invalid/expired token vs insufficient scope vs gated access not granted where the Hub response allows the distinction.
6. Allow user to label the credential and choose whether it is default for Hub downloads. Support multiple accounts/tokens and explicit selection per install.
7. Provide **Forget token**, **Revalidate**, and **Open Hugging Face token settings** actions.
8. Do not automatically revoke a token when the user disconnects; deletion/revocation is an account-side action and must be clearly distinguished from removing the local credential.

**Acceptance:** token does not appear in frontend storage, SQLite, logs, crash output, process list/argv, or exported diagnostics; saved token can be forgotten; expired/rotated token recovery is clear.

## 16.3 Gated model authorization workflow

Gated access is a Hugging Face account/repository permission, not a property the app can grant on the user's behalf.

1. For every model/revision, retrieve and display its gated/private status from reliable current Hub metadata.
2. Before attempting file access, check whether the currently selected account appears authorized using a minimal documented metadata/file-head request.
3. If access is missing or user has not signed in:
   - Show **Sign in** if no account is configured.
   - Show **Request/Review access on Hugging Face** as an external browser action when the Hub offers that action.
   - State that the publisher may require terms acceptance or manual approval and that the app cannot accept terms or approve access for the user.
   - After the user completes the browser action, offer **Check access again**; do not poll aggressively.
4. If access is granted, show authorized account and proceed to exact revision/artifact selection. Pin repository commit SHA in the install plan.
5. If an access request is pending, report pending rather than failing repeatedly. Provide refresh/manual recheck.
6. If access is denied, explain that only the publisher/Hub can change authorization; do not retry with alternate accounts automatically.
7. Treat HTTP 401/403 carefully: distinguish unauthenticated, invalid token, insufficient scope, repository gating, organization policy, and denied/pending authorization only when the response/documentation supports that diagnosis. Otherwise show “Access not confirmed” and a safe next step.
8. Never attempt to bypass gated access through mirrors, alternate credentials, anonymous URLs, cached signed links from another account, or another user's local cache.
9. The app may cache public metadata, but must not redistribute gated weights or export them into public bundles. Respect the repository's terms and the selected user's authorization.

## 16.4 Credential handoff to serving runtimes

The app's Hub credential and a runtime's own credential are separate secrets with separate scopes. An authenticated app does not automatically authenticate a subprocess, WSL distribution, Docker container, or runtime endpoint.

For each adapter, research whether it can:

- Have the app download authorized files and import from a local path (preferred where supported).
- Receive an access token through a documented secure runtime credential mechanism.
- Use an existing runtime/Hugging Face cache authenticated under the user's account.
- Access the repository directly itself.

Default policy:

1. Prefer **app-authenticated download followed by local import** if the runtime supports it and the license/workflow permits it. This avoids handing the HF token to another process.
2. If a runtime must fetch directly, explain exactly which runtime/process/environment receives the token, why it needs it, how long it remains available, and how it is removed.
3. Do not put a token in command-line arguments, generated Modelfile, Docker image, persistent environment file, URL, or world-readable config.
4. If no secure, documented handoff exists, disable direct runtime fetch and use a safe local import workflow or explain that this runtime cannot install this gated artifact through the app.
5. For WSL2/containers, do not copy a long-lived token into Linux home, shell history, image layers, or environment files without explicit consent and a documented cleanup path. Prefer one-time app-side download and local file transfer.
6. For remotely configured runtime endpoints, warn that the artifact and/or token may leave the local machine. Require explicit user confirmation and disclose the endpoint host before sending.
7. Support account selection per job, but do not store tokens in install profiles; profiles store credential references/labels only.

## 16.5 Token scopes, expiry, and account UI

- Explain least privilege: use a read-only or fine-grained token scoped to the needed repositories where practical; never ask for write/admin scope for model downloads.
- OAuth scope policy: request `gated-repos` only for gated repository reading/downloading, and `request-gated-repos` only for an explicitly user-initiated access-request feature. Keep public browsing unauthenticated where possible. Show requested permissions before redirecting to Hugging Face.
- Explain that fine-grained scope and organization token policy may require additional approval. Do not infer effective permissions solely from the token's label.
- Track expiry/status only if the official token/auth flow exposes it. Otherwise show “expiry not available” and allow revalidation.
- Handle expired, refreshed, revoked, deleted, or policy-denied credentials with a reconnect/update path.
- Never display the full token after initial entry. Show a short non-reversible identifier (e.g. label or last four characters only if security review approves); prefer account name and scope summary.
- Restrict simultaneous token validation and downloads to avoid accidental cross-account artifact mix-up.
- Record which account label was used in an install audit record, never the token value.

## 16.6 Authentication security tests

Required tests:

1. No credential: public model metadata works; gated file fetch is blocked with sign-in guidance.
2. Valid read token with gated access: exact file fetch succeeds.
3. Valid token without gated permission: no install starts; access request guidance shown.
4. Pending and denied access: UI reports correct state only where evidence permits.
5. Expired, revoked, malformed, insufficient-scope, and organization-policy token cases.
6. User switches accounts between metadata and download; job must bind to selected account and revision.
7. Token rotation while a job is queued; revalidate before download and do not silently fall back to another credential.
8. Redirected file download: authorization header is never forwarded to an untrusted host; use official Hub redirect handling.
9. Logs, frontend storage, SQLite, crash report, support bundle, process argv/environment, generated files, and telemetry secret scans.
10. Login callback CSRF/state/replay/expiry and cancellation tests if OAuth is implemented.
11. Disconnect removes local secret reference but does not claim server-side token revocation.
12. Remote runtime confirmation clearly identifies destination before any credential or model bytes are sent.

## 16.7 Authentication acceptance criteria

The feature is complete only when:

- A user can connect using an officially supported browser login flow, **or**, if no supported OAuth flow is available, can securely enter and validate a Hugging Face User Access Token.
- Gated access status, approval/terms requirements, and failure reasons are explained without promising that login bypasses publisher controls.
- A permitted gated artifact can be downloaded/imported into each supported runtime through a documented and tested credential path.
- Credentials are not exposed outside approved native code/storage boundaries.
- Users can select, validate, rotate/update, and forget credentials.
- Tests prove authorization, permission, and secret-handling behavior. Mocks alone are insufficient for a release claim that gated downloads work; at least one authorized test repository/account is needed in a controlled integration environment.

## 16.8 Official Hugging Face source to re-check at implementation time

- [User Access Tokens](https://huggingface.co/docs/hub/security-tokens): token roles, read/fine-grained permissions, gated-repository permission, token expiry, revocation, and best practices.
- [Gated models](https://huggingface.co/docs/hub/models-gated): current user access/request/approval behavior and how gated access is enforced.
- [OAuth and token exchange](https://huggingface.co/docs/hub/oauth): current public-app/native-app support, device authorization, authorization-code/PKCE and loopback options, and available scopes including `gated-repos` and `request-gated-repos`.

Record the exact documentation revision/access date in `docs/research/runtime-matrix.md` when implementation starts. Do not assume the details in this plan remain unchanged.

*End of Master Plan & Specification (revision 3.3.0).*
