# Open Questions & Assumptions Ledger

| ID | Claim / Question | Affected Feature | Evidence / Source | Confidence | Next Action | Blocks Release? | Resolution |
|---|---|---|---|---|---|---|---|
| OQ-001 | Desktop Framework choice | Core Shell | Host has Node 26 + .NET 9/10, lacks Rust/cargo | High | Approved Electron v45 + React 19 + TypeScript | No | Resolved in ADR-0001 |
| OQ-002 | Hugging Face Gated Repo OAuth vs Token | Authentication | HF documentation for OAuth Public Apps & User Access Tokens | High | Implemented secure token vault + OAuth PKCE flow specification | No | Resolved in Section 16 |
| OQ-003 | Windows SmartScreen on custom binary | Installer / Distribution | Windows Defender SmartScreen | High | Include local self-signed testing certificate + Azure Trusted Signing instructions in Gate F | No | Documented in Gate F |
| OQ-004 | Multi-shard GGUF resolution | Hugging Face SAIE | llama.cpp sharding convention `00001-of-0000X.gguf` | High | Regex parser groups all shards and ensures complete sets before install | No | Implemented in GGUF resolver |
