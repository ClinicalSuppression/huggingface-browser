# Changelog

## 1.0.0

First stable release.

### Highlights

- Discover Hugging Face models and inspect available model files, formats, and metadata.
- Sort model discovery results by trending, downloads, likes, recently updated, or recently created.
- Estimate per-model maximum usable context from available GPU memory, estimated Q4 weights, FP16 KV cache, and reserved VRAM headroom.
- Show a VRAM overflow warning when estimated model weights or the minimum usable context do not fit the selected GPU.
- Connect to local Ollama, llama.cpp, xollama, and vLLM runtimes for model deployment workflows.
- Protect Hugging Face access tokens using encrypted local storage.

### Estimate limitations

Context recommendations depend on inferred or available model metadata and approximate weight/KV-cache requirements. Runtime-specific limits, cache formats, and memory allocations may differ; verify settings with the selected runtime before generation.
