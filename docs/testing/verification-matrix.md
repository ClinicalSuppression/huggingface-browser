# Verification & Test Matrix

This matrix distinguishes automated deterministic checks from environment-dependent
gates. Passing an automated test does not establish behavior on every machine.

## Unit tests, typecheck, and build

| Test ID | Scope | Command / Verification | Deterministic evidence / Pass criteria |
|---|---|---|---|
| VT-001 | Unit suite | `npm test` | Vitest runs the repository's automated tests, including sizing, GGUF parsing, presets, adapters, database, and download validation. Pass when the command exits successfully. |
| VT-002 | Sizing logic | `npm test -- test/sizing.test.ts` | Exercises sizing estimates with test fixtures; it does not establish actual GPU/VRAM capacity or runtime performance. |
| VT-003 | GGUF parsing | `npm test -- test/gguf-parser.test.ts` | Checks parser behavior against fixture inputs; it does not establish compatibility with every GGUF artifact. |
| VT-004 | Hardware profiler | `npm test -- test/hardware.test.ts` | Exercises profiler logic under test conditions. No specific GPU, VRAM quantity, or physical hardware detection is established by this invocation. |
| VT-005 | Purpose presets | `npm test -- test/presets.test.ts` | Checks preset and parameter mapping behavior represented by tests. |
| VT-006 | Hugging Face artifact resolution | `npm test -- src/core/hf-client.test.ts` | Deterministically checks revision-pinned artifact URL construction, sibling size handling, absence of an invented checksum, and rejection of ambiguous, incomplete, or unsafe artifact entries. This is not a live Hugging Face service check. |
| VT-007 | DownloadManager integrity | `npm test -- test/download-manager.test.ts` | Uses a local HTTP test server to check SHA-256 and size mismatch rejection, preservation of an existing destination, temporary-file cleanup, and promotion of a valid payload. |
| VT-008 | Database persistence and progress-write throttling | `npm test -- test/db.test.ts electron/job-progress-throttle.test.ts` | Exercises SQLite-backed runtime/job insertion and retrieval, propagation of a job persistence failure, and coalescing intermediate progress writes while preserving immediate initial/terminal persistence. The synthetic throttle test reduces 10,001 callbacks to 2 writes; crash recovery may retain stale intermediate progress. |
| VT-009 | General adapter tests | `npm test -- test/adapters.test.ts` | Exercises adapter behavior represented by its tests. |
| VT-010 | Adapter implementation tests | `npm test -- src/adapters/adapters.test.ts` | Exercises adapter behavior represented by its tests. |
| VT-011 | Ollama install workflow and storage path | `npm test -- electron/install-path.test.ts src/adapters/ollama-install.test.ts` | Checks configured absolute/`%USERPROFILE%` storage roots, rejects invalid paths, confirms a non-default root is used for GGUF/Modelfile paths, and confirms insufficient disk space fails before download/import requests. Uses temporary paths and local HTTP servers; it does not require a live Ollama server. |
| VT-012 | Core tests | `npm test -- src/core/core.test.ts` | Exercises core logic represented by its tests. |
| VT-013 | Cache scanner | `npm test -- test/cache-scanner.test.ts` | Exercises cache-scanning behavior represented by its tests. |
| VT-014 | Credential vault | `npm test -- test/credential-vault.test.ts` | Exercises credential-vault behavior represented by its tests; treat credential-related checks as security-sensitive. |
| VT-015 | Performance checks | `npm test -- test/performance.test.ts` | Runs the repository's performance-oriented test cases. Results are not a guarantee of performance on other machines. |
| VT-016 | Mock UI data service | `npm test -- src/ui/data/mockService.test.ts` | Exercises the mock data service, not a live backend. |
| VT-017 | IPC security | `npm test -- test/ipc-security.test.ts` | Exercises sender/IPC security checks represented by tests. Sender validation does not mitigate XSS in the trusted renderer; see Security boundary below. |
| VT-018 | Typecheck | `npm run typecheck` | Pass when TypeScript reports no type errors. |
| VT-019 | Application build | `npm run build` | Runs the configured Vite build and Electron TypeScript compilation; pass when both complete successfully. |

## Packaging

| Test ID | Scope | Command / Verification | Pass criteria |
|---|---|---|---|
| VT-020 | Package generation | `npm run package` | Uses the configured electron-builder Windows x64 targets to produce NSIS installer and portable artifacts under `dist-release` (named `Hugging Face Browser-<version>-Setup-x64.exe` and `Hugging Face Browser-<version>-Portable-x64.exe`). Successful packaging does not by itself verify installation or runtime behavior. |

## Live Ollama (environment-dependent)

| Test ID | Scope | Command / Verification | Pass criteria |
|---|---|---|---|
| VT-021 | Local Ollama server integration | `npm test -- test/live-ollama.test.ts` | **Environment-dependent and potentially side-effecting gate.** Requires a reachable Ollama server at `127.0.0.1:11434` and at least one already-installed model. Tests daemon detection, health, and model listing, then runs an inference smoke check using the smallest existing model and a short prompt. It does not install a model. Running inference may consume resources or affect the running server; it is not deterministic in a server-free environment and does not guarantee inference on other machines. |

## Packaged Windows smoke checks

| Test ID | Scope | Verification | Pass criteria |
|---|---|---|---|
| VT-022 | Packaged Windows startup and IPC smoke | On Windows, set `SMOKE_TEST=1` and launch `dist-release/win-unpacked/Hugging Face Browser.exe`; capture stdout/stderr and process exit status. | Pass when process exits 0, stdout contains `[MAIN_SMOKE] HTML and preload loaded cleanly in BrowserWindow!`, and stderr has no `[IPC_GUARD]` or `Untrusted IPC sender` errors. This starts the unpacked app and quits automatically; it does not test the NSIS installation flow or interactive navigation. |
| VT-023 | Installed Windows UI/upgrade workflow | **Manual, environment-dependent:** install the generated NSIS artifact, open the app, verify basic navigation and keyboard operation, and check upgrade behavior over an existing install when available. | Record OS, artifact, installation state, result, and any failure. The unpacked startup smoke is not a substitute for this check. |
| VT-024 | Packaged Windows runtime/model workflow | **Manual, environment-dependent and potentially side-effecting gate:** on the target Windows setup, exercise connection to the intended local runtime and a small-model prompt if available. | Record runtime/model/environment and result. No particular hardware or generation performance is implied; inference may consume resources or affect the runtime. |

## Security boundary

Sender validation checks which IPC sender may invoke privileged handlers; it does
not mitigate cross-site scripting (XSS) in the trusted renderer. A renderer XSS
could act with that renderer's authority. Treat renderer content and any untrusted
data rendered there as security-sensitive independently of sender validation.
