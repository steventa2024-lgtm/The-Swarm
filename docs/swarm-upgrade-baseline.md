# Swarm upgrade baseline — 27 October 2026

Created before upgrade implementation. Branch: `feat/hardlight-command-center`.
Reversible starting checkpoint: `2f22ff7` (verified Cursor subscription workspace-trust fix), based on `ad9e4d5`. The checkpoint preserves the newer local Telegram implementation; no reset to upstream main was performed.

## Verified today

- Tauri 2 / Rust, React / TypeScript, Zustand and SQLite remain the application architecture.
- Existing planner, dependency scheduler, parallel workers, reviewer, graph, sandboxed preview, verification runner, immutable native review-before-apply, approved-root checks, project memory, run history and flight recorder are present.
- Baseline TypeScript: **192 passed, 1 skipped** (20 files; 19 passed, 1 skipped). The first sandbox attempt failed opening Vitest temporary transforms; the unrestricted local rerun passed. No failing suite is being hidden.
- Baseline Rust: **41 passed, 1 ignored**. The ignored test deliberately performs real subscription inference.
- Native Telegram metadata currently has seven slots, an existing numeric owner pairing and private HQ group pairing. Credentials were not read. Six connected identities and earlier receipts are historical evidence until checked again in the upgraded executable.
- Cursor's approved `--trust` fix is scoped to the fresh proposal-only scratch directory. Read/write/shell/web/MCP tools remain denied. The last native Cursor inference probe succeeded; this is separate from subscription billing entitlement for individually selected premium models.
- The earlier two-file activation proposal remains staged, not applied. No new approval is inferred from this upgrade request.
- Hardlight kit README, manifest, concept contact sheet and implementation reference were inspected. These are static concept crops, not rigged 3D characters. The consolidated pasted request takes precedence over kit guidance.

## Gaps and risks

- Ordinary Telegram events currently expose opaque identifiers and duplicate HQ/specialist updates. Rich media and artifact retrieval need a native privacy boundary.
- Existing generic paid-API opt-in is incompatible with the new DeepSeek-only rule and must fail closed even for legacy persisted settings.
- CLI invocation model selection, verified catalogs, manual locks, bounded per-provider queues and usage provenance need strengthening. Unknown subscription allowance must remain unknown; premium-model inclusion cannot be inferred from a model listing.
- Claude allowance was exhausted at the last live check. Google personal-plan migration and Grok subscription entitlement have not been verified in this app. DeepSeek has no configured key or chargeable-test approval.
- Eight identity artwork, state bridge, inspector, gallery, motion accessibility and model controls are missing. Agent persona names must not imply that a different actual provider performed the work.
- Capture, recording and externally sending private project material require scoped owner authorization. Bot profile edits, recording, paid smoke tests, publication, purchases, merges and live trading are outside automatic approval.
- Windows is the current build target. macOS secure storage/build behavior must be marked unverified until tested there.

## Preserved invariants

Only Zero decides whether exact reviewed revisions are applied. Renderer input, Telegram callbacks, model prose, tool output, personality and replay cannot grant authority. Root/path/symlink restrictions, immutable staging hashes, owner numeric ID, expiry and one-time callback checks stay native. Existing vault entries, six Telegram usernames, offsets, pairing and recovery data must survive additive migrations. No secrets enter Git, logs, prompts or media.

## Execution order

1. **M1:** Typed communication intent, safe real names/titles, deterministic natural templates, one origin per event, honest actual-provider attribution; tests and harmless live delivery.
2. **M2:** Bounded native media registry and delivery, safe artifact commands and URL checks; scoped capture/recording permission controls, receipt evidence and documented manual prerequisites.
3. **M3:** Model Control Center, invocation-scoped model/effort, absolute locks, local usage caps, provider queues and unavailable allowance states.
4. **M4:** DeepSeek-only native API with vault entry, explicit enable/egress, bounded requests, conservative daily reservations, models/balance checks and mocks; no paid inference without separate approval.
5. **M5:** Eight Hardlight identities, real state bridge, inspector/gallery, reduced motion, responsive dashboard and Telegram avatar previews only.
6. **M6:** Small non-sensitive staged fixture, genuine workers and reviewer, tests/preview/media, durable evidence; owner rejection and approval are manual gates. No approval is simulated.

Each milestone is checkpointed after passing relevant checks. The final report separates VERIFIED LIVE, VERIFIED LOCAL, MOCK-TESTED, MANUAL and BLOCKED. Missing credentials or owner-only decisions do not block independent implementation.
