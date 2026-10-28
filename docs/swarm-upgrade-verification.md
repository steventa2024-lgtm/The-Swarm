# Upgrade verification — 28 October 2026 UTC

Branch: `feat/hardlight-command-center`. Starting checkpoint `2f22ff7`; communication checkpoint `a3dd6c9`; integrated foundation `c5df4a1`; prior evidence checkpoint `a380bb7`. Later verification/UI checkpoints are listed in Git history. No merge, deployment, publication, purchase or bot profile update was performed.

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
| Own-window video | VERIFIED LOCAL / Telegram VERIFIED LIVE | Native PrintWindow capture + FFmpeg produced a real **15.000 s**, **1496×978**, **H.264 / yuv420p** MP4 (147,341 bytes). First and middle frames inspected; middle frame shows red capture indicator + Stop control. Native `sendVideo` receipt succeeded. Phone playback awaits Zero's confirmation. New media deliveries include an owner-authorized Confirm received button. |
| Screenshot / safe report upload | VERIFIED LOCAL capture / Telegram VERIFIED LIVE | Native `sendDocument` accepted the safe public policy report. The scoped native fixture PNG was captured and visually inspected in the actual sandboxed preview: “Awaiting Zero” / “No files applied.” Native Telegram `sendPhoto` returned confirmed **sent** status. Owner confirmation of receipt on the phone remains pending. |
| Model controls / queues | VERIFIED LOCAL | Tested precedence, unavailable-lock refusal, one-provider FIFO and cancellation, native per-task/day starts, invocation-scoped args and unsupported-effort rejection. Remaining provider allowance is unavailable, not fabricated. |
| Multi-project recovery | VERIFIED LOCAL | Two project slots, distinct-root guard, per-provider queues and durable flight frames. Interrupted projects recover as stopped; no automatic tools/approval replay. |
| Hardlight / responsive UI | VERIFIED LOCAL | Eight actual assets; idle/offline/live state bridge; inspector; Preview gallery; Off/Subtle/Cinematic; reduced-motion and offscreen pause. Four browser sizes passed. Native executable viewed directly. Static concept art, not rigged 3D. |
| External MCP | MANUAL / DISABLED | No verified server/schema/cost class was supplied. Registry exposes the real native tools and their scopes; external MCP execution is not fabricated. |
| Owner rejection / final apply | VERIFIED LIVE request delivery / MANUAL decision | Immutable native broker, owner ID, nonce/expiry/replay, root and high-risk confirmation regressions pass. HQ sent the current two-file revision and a new zero-file harmless probe; both await Zero's decision. High-risk approval records intent and still requires native confirmation. Nothing has been applied. |

## Current checks

- Baseline: 192 TypeScript passed / 1 skipped; 41 Rust passed / 1 ignored.
- Full upgraded TypeScript suite: 198 passed / 1 skipped before the final recovery test; the final full rerun passed **199 / 1 skipped (200 total)**.
- Rust: **52 passed / 2 ignored**. One ignored test performs subscription inference; the other requires installed signed-in metadata discovery and was separately run: **1 passed**, 8 models returned, no inference.
- Typecheck + Vite production build and Windows Tauri development compilation pass. Vite reports a non-fatal large-bundle warning (~957 KB JS before gzip).
- Existing UI smoke, Telegram UI smoke, and new Hardlight responsive smoke all passed after the final Approvals/History navigation addition. Preview and Telegram smoke checks were also repeated after the last media-receipt change.
- Browser layouts: 1440×900, 1920×1080, 1536×864 CSS area (125% scaling equivalent), 1024×768. This does not claim a separate native Windows DPI-setting test. Native desktop was inspected at its actual current size.
- Independent fixture acceptance: **6 passed** against exported reviewed copies, with actual browser rendering. The first fixture failed the explicit Zero-authority check; it was corrected through another real two-worker/reviewer run. No failing acceptance result was hidden.

## Current harmless fixture

Accepted run: `run_1pctb79`; prior run `run_ozq9x04` was superseded after independent inspection found ambiguous README approval language. Both were real provider executions. Final proposed files: `index.html`, `README.md`; both under 15 lines, offline/script-free, and README explicitly reserves approval to Zero. The corrected run reports **63,590** provider tokens. Combined two runs: **127,004** locally recorded reported tokens, 8 starts. These are observed subscription activity, not remaining-account quota or a USD charge.

Review copies, exact SHA-256 hashes and six acceptance results: `artifacts/hardlight/fixture-corrected/`. These copies are verification artifacts, not an apply to the approved target. A fresh read after the latest Telegram requests still found the actual `artifacts/demo-approval-target/` empty. No owner approval was manufactured.

Representative delivered templates from the real workflow include “Zero, work has started on Swarm Subscription Activation…” and “Codex finished a proposal for ‘Prepare HTML review fixture’… nothing has been applied.” These are deterministic summaries of actual events, not invented agent conversation. Exact internal provenance remains in the flight recorder and Telegram delivery journal.

## Artifacts and manual gates

Executable: `artifacts/The Swarm Hardlight.exe`. Final source checkpoint: `5a44c5d`. Binary SHA-256: `67503AB0E0DD0B8E707E3010F54A54EC5F6A5B378CC1A95C0CEE99C8478A9B4A`. Native `sendDocument` receipt for the 554-byte public policy report also succeeded. Preserve the prior Telegram executable. Browser evidence: `artifacts/hardlight/{dashboard,models,gallery}-*.png`. Native clip: `artifacts/hardlight/swarm-demo-15s.mp4`; inspected frames `native-capture-frame.png` and `native-recording-indicator.png`.

Latest observed media and approval evidence:

- Native screenshot: `artifacts/hardlight/native-fixture-preview.png`, **957,660 bytes**, artifact `f873ef1e-28d6-4fef-92ac-33fb4ea3a88f`, SHA-256 `4115aadde393ef10b5dacae48ded3df8373ee4cd457937c1a8571a9a09333d72`. The actual sandboxed fixture was visually inspected and shows **Awaiting Zero** / **No files applied**. Native `sendPhoto` status is **sent**; phone receipt is not yet owner-confirmed.
- Zero-file harmless probe: `bebf80d9-a82a-4aa1-afea-720a4a31cdfc`. Native Telegram request delivery has a **sent** receipt. Its owner decision, including the requested rejection demonstration, remains pending; no rejection is claimed.
- Actual two-file revision: `3cd8cba6-461e-4384-b558-0ee44bac5abc`, for accepted run `run_1pctb79` (`index.html` and `README.md`). HQ sent the request and the native UI shows **Awaiting Zero**. The revision is **high risk**: Telegram approval may record intent, but the exact revision still requires Zero's native confirmation before applying. No approval, intent decision or apply result is claimed.
- The executable remains unchanged at the source checkpoint and SHA-256 above. The newer Git checkpoint records subsequent evidence; it does not imply a rebuilt binary.

Remaining owner actions: confirm phone photo receipt and video playback; respond to the harmless rejection probe and exact fixture proposal; confirm native high-risk apply only if desired. Those live decisions remain manual gaps. DeepSeek key entry and first paid authorization remain entirely optional. See the dedicated setup and rollback documents. Fixed native subscription ceilings and disabled external MCP are explicit release limitations, not claimed finished provider integrations.
