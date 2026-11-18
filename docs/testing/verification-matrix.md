# Verification & Test Matrix

| Test ID | Scope | Target Component | Command / Verification | Pass Criteria |
|---|---|---|---|---|
| VT-001 | Unit / Type | TypeScript Interfaces & DTOs | `npm run typecheck` | 0 errors across all adapter and IPC contracts |
| VT-002 | Unit / Logic | Mathematical Sizing & VRAM Estimator | `npm test -- test/sizing.test.ts` | Correctly predicts Full GPU Fit, Partial Split, CPU-only for 7B/14B/70B models |
| VT-003 | Unit / Parsing | GGUF Shard & Quant Parsing | `npm test -- test/gguf-parser.test.ts` | Accurately groups multi-shard files and parses quant levels (Q4_K_M, IQ4_XS, FP8) |
| VT-004 | Integration | Hardware Profiler | `npm test -- test/hardware.test.ts` | Successfully detects AMD Radeon RX 7800 XT (16 GB VRAM) and 64 GB System RAM |
| VT-005 | Integration | Ollama Live Adapter | `npm test -- test/ollama-adapter.test.ts` | Connects to `127.0.0.1:11434`, lists live installed models, health check passes |
| VT-006 | Integration | Hugging Face Search & Gated Model Check | `npm test -- test/hf-client.test.ts` | Searches models, extracts siblings, verifies gated repo metadata handling |
| VT-007 | Integration | Purpose Preset & Parameter Mapping | `npm test -- test/presets.test.ts` | Produces correct reasoning/instruct configs and think-budget mappings |
| VT-008 | UI / Functional | Electron Desktop Shell & Frontend Build | `npm run build` | Bundles cleanly with zero compile errors |
| VT-009 | Reliability | Download Manager & Cancellation | `npm test -- test/download.test.ts` | Resumable chunking, SHA-256 calculation, and clean abort signal handling |
| VT-010 | Verification | Live Model Smoke Test | Manual / Live probe | 1-token prompt to running local runtime returns valid generation |
