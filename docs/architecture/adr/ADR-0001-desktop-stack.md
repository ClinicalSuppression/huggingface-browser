# ADR-0001: Desktop Framework and Core Stack Selection

## Status
Accepted

## Context
The Hugging Face Model Browser and Local Inference Hub requires a desktop runtime for Windows 11 (x64 and ARM64). The master plan specified a time-boxed technical spike evaluating:
- **Candidate A:** Tauri v2 (Rust Core + Web Frontend)
- **Candidate B:** C# .NET 9 WinUI 3 (Windows App SDK)
- **Candidate C:** Electron v45+ (Node 26 native core + React 19 / TypeScript 5.5+)

## Spike Findings & Evidence
1. **Candidate A (Tauri v2):** `rustc` and `cargo` are not installed on the production build machine. Installing Rust and the complete MSVC C++ toolchain introduces high setup overhead and external dependency friction.
2. **Candidate B (.NET 9 WinUI 3):** .NET 9/10 SDK is available. However, WinUI 3 has complex XAML/C++ interop requirements for high-frequency streaming UI updates, custom shard visualizers, and Hugging Face model card Markdown renderers compared to React 19.
3. **Candidate C (Electron v45 + Node 26 + React 19 + Vite + TypeScript):**
   - Installed and verified in 4 seconds (`v45.3.4`).
   - Node 26 engine provides full native access to:
     - Win32 process spawning and process tree termination (`taskkill /T /F` / `tree-kill`).
     - Windows Credential Manager integration for HF tokens.
     - Fast non-blocking streaming HTTP downloads with pause, resume (`Range` headers), and SHA-256 calculation.
     - Direct IPC bridge using `contextBridge` and strict `preload.js` isolation (WebView cannot access Node internals directly).
     - Full Chromium accessibility engine (UI Automation, Screen Reader, ARIA live regions).
   - React 19 with Vite provides sub-second HMR and instant UI compilation.

## Decision
Select **Candidate C: Electron v45 with Node 26 native backend and React 19 / TypeScript / Vite / TailwindCSS / Fluent Design tokens**.

## Consequences
- Full native access to Windows APIs and running local model engines (Ollama, llama.cpp, xollama, vLLM).
- Strict security model: Renderer process is sandboxed (`nodeIntegration: false`, `contextIsolation: true`).
- Fast, reproducible build and packaging pipeline.
