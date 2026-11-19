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
| VT-006 | Hugging Face API and artifact handling | `npm test -- src/core/hf-client.test.ts` | Checks revision-pinned artifact URL construction, sibling size handling, absence of an invented checksum, unsafe artifact rejection, and bounded UTF-8 response reads (16 MiB JSON / 2 MiB text). This is not a live Hugging Face service check. |
| VT-007 | DownloadManager integrity and network bounds | `npm test -- test/download-manager.test.ts` | Uses local HTTP servers to check SHA-256/size validation, existing-destination preservation, partial cleanup, cancellation, 60-second inactivity timeout behavior, rejection of non-Hugging Face/cross-scheme redirects, and a five-hop limit. No live HF requests are needed. |
| VT-008 | Database persistence, interrupted-job recovery, and progress-write throttling | `npm test -- test/db.test.ts electron/job-progress-throttle.test.ts` | Exercises SQLite-backed runtime/job insertion, persistence-failure propagation, startup conversion of active jobs to interrupted failures while preserving progress/terminal rows, and coalescing intermediate progress writes while preserving immediate initial/terminal persistence. The synthetic throttle test reduces 10,001 callbacks to 2 writes; recovery does not resume jobs or delete partial files. |
| VT-009 | General adapter tests | `npm test -- test/adapters.test.ts` | Exercises adapter behavior represented by its tests. |
| VT-010 | Adapter implementation tests | `npm test -- src/adapters/adapters.test.ts` | Exercises adapter behavior represented by its tests. |
| VT-011 | Ollama install workflow, storage path, and request bounds | `npm test -- electron/install-path.test.ts src/adapters/ollama-install.test.ts` | Checks configured absolute/`%USERPROFILE%` storage roots, rejects invalid paths, confirms a non-default root is used for GGUF/Modelfile paths, insufficient-space rejection before network activity, and timeout/cancellation behavior for Ollama listing, verification, registration, and deletion. Uses temporary paths and local HTTP servers; it does not require a live Ollama server. |
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
| VT-020 | Package generation | `npm run package` | **Passed for v1.0.0 on 2026-11-19:** electron-builder produced the Windows x64 NSIS installer (134,822,405 bytes) and portable executable (117,434,905 bytes). Packages are unsigned because no signing certificate is configured. |

## Live Ollama (environment-dependent)

| Test ID | Scope | Command / Verification | Pass criteria |
|---|---|---|---|
| VT-021 | Local Ollama server integration | `npm test -- test/live-ollama.test.ts` | **Environment-dependent and potentially side-effecting gate.** Requires a reachable Ollama server at `127.0.0.1:11434` and at least one already-installed model. Tests daemon detection, health, and model listing, then runs an inference smoke check using the smallest existing model and a short prompt. It does not install a model. Running inference may consume resources or affect the running server; it is not deterministic in a server-free environment and does not guarantee inference on other machines. |

## Packaged Windows smoke checks

| Test ID | Scope | Verification | Pass criteria |
|---|---|---|---|
| VT-022 | Packaged Windows startup and IPC smoke | On Windows, set `SMOKE_TEST=1` and launch the packaged app with a separate `--user-data-dir` to isolate it from an already-running instance; capture stdout/stderr and process exit status. | **Passed for the installed v1.0.0 build on 2026-11-19:** exit 0; stdout contained `[MAIN_SMOKE] HTML and preload loaded cleanly in BrowserWindow!`; stderr was empty. The portable executable also exited 0 in smoke mode, but its stdout did not expose the expected marker, so portable startup is additionally covered by the interactive audit in VT-026. |
| VT-023 | Installed Windows UI/upgrade workflow | **v0.1.2-to-v0.1.3 migration passed on 2026-11-19.** Reinstalled the official v0.1.2 Inno installer (its SHA-256 matched the GitHub asset digest; exit 0), then ran the freshly packaged v0.1.3 NSIS installer silently (exit 0). **v0.1.3-to-v1.0.0 upgrade also passed on 2026-11-19:** 1.0.0 NSIS installer exited 0 and installed product version `1.0.0.0`. | After the original migration, the exact legacy Inno registration and `%LOCALAPPDATA%\Programs\HF Browser` were absent; the v0.1.3 uninstall entry remained. The v0.1.3 startup smoke exited 0 with expected `[MAIN_SMOKE]` output and empty stderr. User data was preserved across both upgrades: `.config/ollama-hf-browser/database.sqlite` remains 53,248 bytes with SHA-256 `B1175F22E79B40E0A85623350FCC16E870A4701DF4C75CAFDA74838EC2CFD364`; `%APPDATA%\huggingface-browser\Local Storage\leveldb` remains present. The installer only invokes the validated default-path v0.1.2 uninstaller and does no fallback deletion. Environment: Windows 10 Pro, build 26200. |
| VT-024 | Packaged Windows runtime/model workflow | On Windows, exercise connection to the intended local runtime and a small-model prompt if available. | **Passed on 2026-11-19:** local Ollama `0.40.16`, seven installed models, AMD Radeon RX 7800 XT host. `256k-TPK-tuned-Qwen3.8-9B-Distill-unc-her-MTP:iQ4_K_M` (5.8 GB) produced a concise answer through `/api/chat` (68 generated tokens; 10.6 seconds); `keep_alive=0` unloaded it afterward. The app's compiled `OllamaAdapter` detected the runtime, passed health/model-list checks, and `verifyInstall` succeeded on the same model with a 120-second request timeout (109 tokens; reported 85.81 tokens/s). **Caveat:** a cold load using the adapter's default 15-second request timeout timed out; the retry with the longer timeout passed. This is a potential timeout limitation for cold-loading larger models and was not changed in this release. |
| VT-025 | Keyboard and screen-reader accessibility | On 2026-11-19, the updated installed app's Windows accessibility snapshot exposed only window/menu chrome. Direct Chromium DevTools Protocol evaluation showed `document.readyState=complete`, one child under `#root`, 57 root buttons, and one input, confirming the React UI rendered. On the final packaged build, Enter opened the drawer and focused Close; Tab from the last focusable control wrapped to the first; Escape closed the drawer and restored focus. Repeated the open/close sequence on two different model cards and confirmed focus returned to each correct trigger. Chromium viewport emulation of the final packaged build at 320px and 375px showed six distinct mobile-nav items with full `aria-label`s, visible shortened labels, search inputs of 296px/351px, model cards of 144px/172px, and no document-level horizontal overflow. Screenshots: `%LOCALAPPDATA%\Temp\opencode\hf-browser-responsive-check\final-320.png` and `final-375.png`. The user subsequently confirmed that Windows Narrator announcements worked correctly during the requested search-result and drawer-focus checks. | **Verified for the exercised workflows:** packaged UI and keyboard-event focus-trap/restoration passed via Chromium DevTools Protocol; Windows Narrator spoken announcements were confirmed by the user. Arrow/Home/End preset navigation passed in the earlier installed build. Responsive layout passed the emulated 320px/375px checks after compact mobile labels were added. |
| VT-026 | Packaged model-card context and overflow messaging | Installed v1.0.0 and inspected all 50 discovery cards through Chromium DevTools Protocol. | **Passed 2026-11-19:** every card displayed context information; 15 cards explicitly displayed `VRAM OVERFLOW`, with `Below 2K` shown when no usable GPU context was estimated. Examples on the AMD Radeon RX 7800 XT (16 GB VRAM, 13.6 GB free) included `higurashi-ai/Haru-4B` → `Max context · 66K` and `tencent/Hy4-flash` → `Max context · 48K`. No card contained “Best Fit.” The card accessible names include the context and overflow state; estimate caveats are available in tooltips. Values are estimates, not runtime guarantees. |
| VT-027 | Recently created and recently updated sorting | `npm test -- --run src/ui/data/mockService.test.ts`; inspect installed v1.0.0 sort selector. | **Passed 2026-11-19:** focused tests cover creation-date ordering and fallback to `lastModified`; installed sort selector showed distinct `Recently created` and `Recently updated` options. The created sort uses Hugging Face Hub's `createdAt` sort parameter. |

## Security boundary

Sender validation checks which IPC sender may invoke privileged handlers; it does
not mitigate cross-site scripting (XSS) in the trusted renderer. A renderer XSS
could act with that renderer's authority. Treat renderer content and any untrusted
data rendered there as security-sensitive independently of sender validation.
