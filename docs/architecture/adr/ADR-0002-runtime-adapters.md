# ADR-0002: Universal Runtime Adapter System (URAS) Architecture

## Status
Accepted

## Context
Local inference serving is handled by diverse backends with differing lifecycle models, CLI arguments, and HTTP REST APIs:
- `Ollama`: Background daemon (`http://127.0.0.1:11434`), `/api/tags`, `/api/show`, `/api/create`, `/api/generate`, `/api/chat`.
- `llama.cpp`: CLI tool (`llama-cli.exe`) or server daemon (`llama-server.exe`, default ports `8080`, `9931`, or custom), OpenAI-compatible `/v1/models` and `/v1/chat/completions`, native `/health`.
- `xollama`: Optimized Ollama fork by `mann1x` on port 11434 with extended engine routing and think-budget controls.
- `vLLM`: OpenAI-compatible server (`http://127.0.0.1:8000`), `/v1/models`, `/v1/chat/completions`.
- `Custom OpenAI-compatible`: Any endpoint providing `/v1/models` and `/v1/chat/completions`.

## Decision
All runtime operations are mediated through the immutable TypeScript interface `IRuntimeAdapter`:
1. **Loopback isolation:** All automated health checks and discovery probes query loopback addresses (`127.0.0.1` / `localhost`) with a strict 1500ms timeout to avoid network hanging.
2. **Safe process execution:** When executables are spawned, arguments are passed as explicit string arrays (`string[]`), never concatenated into raw shell strings.
3. **No credentials to external processes:** Downloaded models are placed in runtime-accessible directories or imported via standard local APIs (e.g., `ollama create` with local `FROM <path>`); Hugging Face tokens are never passed on CLI command lines or environment variables to subprocesses.
4. **Adapter Factory:** Runtimes register dynamically with the `AdapterRegistry`, which exposes discovery, health monitoring, install planning, and verification to the IPC controller.
