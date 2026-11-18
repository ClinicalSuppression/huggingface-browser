# HF Browser

A desktop model browser, hardware-aware sizing engine, and local inference deployment orchestrator for Windows 11. Connects directly to the Hugging Face Hub and deploys models into local serving runtimes including Ollama, llama.cpp, xollama, and vLLM.

## Overview

Local large language model discovery is frequently complicated by fragmented quantization formats (GGUF, SafeTensors, FP8, AWQ), diverging runtime configurations, and complex VRAM arithmetic. HF Browser provides a unified desktop interface for discovering models, inspecting quantization artifacts, computing exact hardware fit against live GPU telemetry, and deploying with one click.

## Key Features

- **Live Hugging Face Integration:** Embedded interactive model page browser powered by an out-of-process Chromium guest webview alongside a native master-detail split layout.
- **Universal Runtime Adapter System (URAS):** Unified discovery, configuration, and deployment across Ollama, llama.cpp (`llama-server`), xollama (`mann1x/xollama`), and vLLM.
- **Dynamic VRAM Sizing Engine:** Real-time dedicated VRAM usage monitoring via Windows performance counters. Accurately factors model weights, multi-token prediction (MTP) tensors, multimodal vision projectors (`mmproj`), KV cache quantization, and configurable safe VRAM headroom (512 MB default) into hardware fit badges (`Full GPU Fit`, `Partial Offload`, `CPU Only`).
- **Comprehensive Search & Discovery:** Multi-dimensional filtering mirroring Hugging Face's taxonomy:
  - Tasks: Any-to-Any, Text Generation, Multimodal Vision, Conversational, Code Generation, Embeddings.
  - Formats: GGUF, SafeTensors, FP8 / Compressed.
  - Alignment: Full Uncensored search spanning all activation removal (ARA), abliterated, heretic, unaligned, dolphin, and no-refusal aliases.
  - Architectures: 16 model families including Llama, Qwen, DeepSeek, Mistral, Gemma, Phi, Liquid / LFM, Command R, and StarCoder.
  - Hardware Fit: Filter to models that fit comfortably on your active GPU.
- **Universal Hardware Profiler:** Discrete GPU prioritization with standards-based Windows PnP filtering. Filters out phantom, disconnected, or disabled integrated GPUs across any manufacturer without hardcoded model strings.
- **Salted Access Token Security:** Hugging Face User Access Tokens are encrypted on disk using salted AES-256-GCM (PBKDF2 key derivation) and decrypted strictly in-memory during authenticated requests. Tokens are never stored in plaintext or logged.
- **Universal Local Cache Scanner:** Automatically scans local Hugging Face Hub, Ollama, LM Studio, and custom folders to surface already-downloaded models for zero-download local deployment.

## Prerequisites

- Windows 11 (x64 or ARM64)
- Node.js >= 20.0.0 (Node 26 LTS recommended)
- Local serving runtime (Ollama, llama.cpp, xollama, or vLLM) running locally or accessible via network

## Terminal Installation Instructions

### 1. Clone Repository

```bash
git clone https://github.com/Clinical-Suppression/huggingface-browser.git
cd huggingface-browser
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run in Development Mode

```bash
npm run dev
```

In a separate terminal, launch the desktop shell:

```bash
npm start
```

Alternatively, launch silently without an attached console window:

```bash
wscript launch.vbs
```

### 4. Build Production Bundle

```bash
npm run build
```

This compiles the Vite frontend client into `dist/` and the native Electron backend into `dist-electron/`.

### 5. Run Verification Test Suite

```bash
npm test
```

Executes the Vitest unit, integration, and performance benchmark suites.

## Architecture & Technology Stack

- **Desktop Framework:** Electron v45 with Node 26 native engine
- **Frontend Presentation:** React 19, TypeScript, Tailwind CSS with Microsoft Fluent Design System tokens
- **Build System:** Vite, Vitest, TypeScript compiler
- **Persistence:** Local SQLite database with Write-Ahead Logging (WAL) and salted AES-256-GCM credential vault
- **Process Isolation:** Strict context isolation (`contextIsolation: true`, `nodeIntegration: false`) with typed preload IPC bridge

## Standardized Release Assets

Major releases provide:
- Source Archive: `huggingface-browser-vX.Y.Z-src.zip`
- Application Package: Portable and/or setup executable when available

## License

HF Browser is distributed under the [PolyForm Noncommercial License 1.0.0](./LICENSE), copyright (c) 2026 ClinicalSuppression. Noncommercial use, modification, and distribution are permitted; commercial use is not.
