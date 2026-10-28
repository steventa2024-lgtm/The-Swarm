# Upgrade verification — 28 October 2026 UTC

Branch: `feat/hardlight-command-center`. Starting checkpoint `2f22ff7`; communication checkpoint `a3dd6c9`; integrated foundation `c5df4a1`. Later verification/UI checkpoints are listed in Git history. No merge, deployment, publication, purchase or bot profile update was performed.

## Evidence classifications

| Integration / flow | Classification | Observed evidence / limit |
|---|---|---|
| Codex subscription inference | VERIFIED LIVE | Two small fixture runs, each planner + two distinct worker invocations + independent reviewer. Actual provider for all eight calls: Codex, forced ChatGPT login. Model requested: signed-in default; internal model not exposed, so not asserted. |
| Codex model discovery | VERIFIED LIVE | Official local app-server `model/list` returned **8** actual models without inference; the explicit installed-catalog test passed. |
| Cursor CLI | VERIFIED LOCAL / MANUAL entitlement | Approved scratch-directory trust fix preserved. Earlier live readiness probe succeeded. New policy blocks Auto/third-party inference and requires native owner confirmation of included usage for a discovered Cursor-owned model. No account billing setting is changed or assumed. |
| Claude | BLOCKED | Last live allowance check was exhausted. No Anthropic API fallback. Recheck its subscription allowance before reconnecting. |
| Google / Antigravity | MANUAL | Installed tooling and plan migration were identified; authenticated proposal-only adapter use has not been established. Not credited with work. |
| Grok Build | MANUAL | Installed CLI; subscription authentication, entitlement and safe headless execution unverified. No xAI API fallback or assumed X allowance. |
| Ollama | VERIFIED LOCAL (prior inference) | Existing on-device model discovery and Local Only regressions preserved. Not used for the current fixture. No model download was requested. |
| DeepSeek | MOCK-TESTED / BLOCKED credential | Native vault entry, fixed endpoint, model/balance path, egress/session gates, SSE parser, cancellation, reservations and breaker implemented. No key, authenticated balance or chargeable inference was supplied/claimed. Paid use remains OFF. |
| Telegram six existing identities | VERIFIED LIVE | All six getMe checks and pollers succeeded in the upgraded app. Existing numeric owner/private-group pairing retained; eight-slot migration preserves original records. |
| Natural Telegram messages | VERIFIED LIVE | Real task-start, assignment, completion and reviewer outcome deliveries have native sent receipts. One origin per event; IDs remain desktop audit data. |
| Own-window video | VERIFIED LOCAL / Telegram VERIFIED LIVE | Native PrintWindow capture + FFmpeg produced a real **15.000 s**, **1496×978**, **H.264 / yuv420p** MP4 (147,341 bytes). First and middle frames inspected; middle frame shows red capture indicator + Stop control. Native `sendVideo` receipt succeeded. Phone playback awaits Zero's confirmation. |
| Screenshot / safe report upload | MANUAL pending final live check | Native scoped PNG capture, SHA-256 snapshot registry and photo/document upload paths implemented. Do not infer phone receipt from a local file. |
| Model controls / queues | VERIFIED LOCAL | Tested precedence, unavailable-lock refusal, one-provider FIFO and cancellation, native per-task/day starts, invocation-scoped args and unsupported-effort rejection. Remaining provider allowance is unavailable, not fabricated. |
| Multi-project recovery | VERIFIED LOCAL | Two project slots, distinct-root guard, per-provider queues and durable flight frames. Interrupted projects recover as stopped; no automatic tools/approval replay. |
| Hardlight / responsive UI | VERIFIED LOCAL | Eight actual assets; idle/offline/live state bridge; inspector; Preview gallery; Off/Subtle/Cinematic; reduced-motion and offscreen pause. Four browser sizes passed. Native executable viewed directly. Static concept art, not rigged 3D. |
| External MCP | MANUAL / DISABLED | No verified server/schema/cost class was supplied. Registry exposes the real native tools and their scopes; external MCP execution is not fabricated. |
| Owner rejection / final apply | MANUAL | Immutable native broker, owner ID, nonce/expiry/replay, root and high-risk confirmation regressions pass. Current proposal remains unapplied pending Zero's live decision. |

## Current checks

- Baseline: 192 TypeScript passed / 1 skipped; 41 Rust passed / 1 ignored.
- Full upgraded TypeScript suite: 198 passed / 1 skipped before the final additional multi-project recovery test. Final count is recorded after that run below.
- Rust: **52 passed / 2 ignored**. One ignored test performs subscription inference; the other requires installed signed-in metadata discovery and was separately run: **1 passed**, 8 models returned, no inference.
- Typecheck + Vite production build and Windows Tauri development compilation pass. Vite reports a non-fatal large-bundle warning (~957 KB JS before gzip).
- Existing UI smoke, Telegram UI smoke, and new Hardlight responsive smoke all passed before the last Approvals/History navigation addition; final rerun is recorded below.
- Browser layouts: 1440×900, 1920×1080, 1536×864 CSS area (125% scaling equivalent), 1024×768. This does not claim a separate native Windows DPI-setting test. Native desktop was inspected at its actual current size.
- Independent fixture acceptance: **6 passed** against exported reviewed copies, with actual browser rendering. The first fixture failed the explicit Zero-authority check; it was corrected through another real two-worker/reviewer run. No failing acceptance result was hidden.

## Current harmless fixture

Accepted run: `run_1pctb79`; prior run `run_ozq9x04` was superseded after independent inspection found ambiguous README approval language. Both were real provider executions. Final proposed files: `index.html`, `README.md`; both under 15 lines, offline/script-free, and README explicitly reserves approval to Zero. The corrected run reports **63,590** provider tokens. Combined two runs: **127,004** locally recorded reported tokens, 8 starts. These are observed subscription activity, not remaining-account quota or a USD charge.

Review copies, exact SHA-256 hashes and six acceptance results: `artifacts/hardlight/fixture-corrected/`. These copies are verification artifacts, not an apply to the approved target. The actual `artifacts/demo-approval-target/` was still empty after both runs. No owner approval was manufactured.

Representative delivered templates from the real workflow include “Zero, work has started on Swarm Subscription Activation…” and “Codex finished a proposal for ‘Prepare HTML review fixture’… nothing has been applied.” These are deterministic summaries of actual events, not invented agent conversation. Exact internal provenance remains in the flight recorder and Telegram delivery journal.

## Artifacts and manual gates

Executable: `artifacts/The Swarm Hardlight.exe`. The final binary SHA-256 and delivery/owner decisions are recorded after packaging. Preserve the prior Telegram executable. Browser evidence: `artifacts/hardlight/{dashboard,models,gallery}-*.png`. Native clip: `artifacts/hardlight/swarm-demo-15s.mp4`; inspected frames `native-capture-frame.png` and `native-recording-indicator.png`.

Remaining owner actions: confirm phone media playback; decide the harmless rejection probe and exact fixture proposal; confirm native high-risk apply only if desired. DeepSeek key entry and first paid authorization remain entirely optional. See the dedicated setup and rollback documents. Fixed native subscription ceilings and disabled external MCP are explicit release limitations, not claimed finished provider integrations.
