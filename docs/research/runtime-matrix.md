# Runtime Capability & Evidence Matrix

## Date Verified
2026-11-18

## Verified Runtimes

| Runtime | Target Endpoint | Health Probe | Model Discovery | Install/Import Method | Capabilities & Quirks | Evidence Status |
|---|---|---|---|---|---|---|
| **Ollama** | `http://127.0.0.1:11434` | `GET /api/version` | `GET /api/tags` | `POST /api/create` with Modelfile or `ollama pull` | Streams JSON lines; reports runner (`llamacpp`/`ggml`), capabilities (`thinking`, `tools`, `vision`); default port 11434 | **Verified Live on Host** |
| **llama.cpp** | `http://127.0.0.1:8080` or custom | `GET /health` or `GET /v1/models` | `GET /v1/models` | Launch `llama-server.exe --model <path>` | OpenAI-compatible; supports GGUF shards; needs `--mmproj` for vision; flags `-ngl` for GPU offloading | **Verified Live on Host (LM Studio backend)** |
| **xollama** | `http://127.0.0.1:11434` | `GET /api/version` | `GET /api/tags` | Compatible with Ollama API | Extended AVX2/AVX-512/CUDA routing by `mann1x`; shares `.ollama` directory; warning on simultaneous writes | **Documented & Compatible** |
| **vLLM** | `http://127.0.0.1:8000` | `GET /v1/models` | `GET /v1/models` | Server startup parameter `--model <path>` | OpenAI-compatible; high throughput; CUDA/ROCm/WSL2/Docker dependent; pre-allocates KV cache | **Documented & Endpoint Tested** |
| **Custom OpenAI** | User-defined URL | `GET /v1/models` | `GET /v1/models` | User-managed | Any endpoint serving `/v1/chat/completions` and `/v1/models` | **Standard Protocol** |
