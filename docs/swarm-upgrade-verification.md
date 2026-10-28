# Upgrade verification — 28 October 2026 UTC

This records the earlier implementation snapshots. For the subsequent replacement of image/CSS mascots with actual articulated geometry, use the [3D correction acceptance record](hardlight-3d.md); earlier static-art verification is not 3D acceptance.

The current continuation checklist is in [HANDOFF.md](HANDOFF.md). Later entries below supersede earlier pending-request snapshots; none grants owner approval.

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
| Own-window video | VERIFIED LOCAL / Telegram VERIFIED LIVE | Native PrintWindow capture + FFmpeg produced a real **15.000 s**, **1496×978**, **H.264 / yuv420p** MP4 (147,341 bytes). First and middle frames inspected; middle frame shows red capture indicator + Stop control. Native `sendVideo` receipt succeeded. Zero confirmed successful phone playback in chat on 28 October 2026. New media deliveries include an owner-authorized Confirm received button. |
| Screenshot / safe report upload | VERIFIED LOCAL capture / Telegram VERIFIED LIVE | Native `sendDocument` accepted the safe public policy report. The scoped native fixture PNG was captured and visually inspected in the actual sandboxed preview: “Awaiting Zero” / “No files applied.” Native Telegram `sendPhoto` returned confirmed **sent** status. Zero confirmed photo receipt in chat; the native callback audit is tracked separately below. |
| Model controls / queues | VERIFIED LOCAL | Tested precedence, unavailable-lock refusal, one-provider FIFO and cancellation, native per-task/day starts, invocation-scoped args and unsupported-effort rejection. Remaining provider allowance is unavailable, not fabricated. |
| Multi-project recovery | VERIFIED LOCAL | Two project slots, distinct-root guard, per-provider queues and durable flight frames. Interrupted projects recover as stopped; no automatic tools/approval replay. |
| Hardlight / responsive UI | VERIFIED LOCAL | Eight actual assets; idle/offline/live state bridge; inspector; Preview gallery; Off/Subtle/Cinematic; reduced-motion and offscreen pause. Four browser sizes passed. Native executable viewed directly. Static concept art, not rigged 3D. |
| External MCP | MANUAL / DISABLED | No verified server/schema/cost class was supplied. Registry exposes the real native tools and their scopes; external MCP execution is not fabricated. |
| Owner rejection / final apply | VERIFIED LIVE request delivery / EXPIRED, UNAPPLIED | Immutable native broker, owner ID, nonce/expiry/replay, root and high-risk confirmation regressions pass. HQ delivered the later zero-file and two-file requests, but they expired without matching native decisions. High-risk approval records intent and still requires native confirmation. Nothing has been applied. |

## Current checks

- Baseline: 192 TypeScript passed / 1 skipped; 41 Rust passed / 1 ignored.
- Full upgraded TypeScript suite after receipt/expiry corrections: **202 passed / 1 skipped (203 total)**.
- Rust after receipt corrections: **56 passed / 2 ignored**. One ignored test performs subscription inference; the other requires installed signed-in metadata discovery and was separately run: **1 passed**, 8 models returned, no inference.
- Typecheck + Vite production build and Windows Tauri development compilation pass. Vite reports a non-fatal large-bundle warning (~958 KB JS before gzip).
- Existing UI smoke, Telegram UI smoke, and new Hardlight responsive smoke all passed after the final Approvals/History navigation addition. Preview and Telegram smoke checks were also repeated after the last media-receipt change.
- Browser layouts: 1440×900, 1920×1080, 1536×864 CSS area (125% scaling equivalent), 1024×768. This does not claim a separate native Windows DPI-setting test. Native desktop was inspected at its actual current size.
- Independent fixture acceptance: **6 passed** against exported reviewed copies, with actual browser rendering. The first fixture failed the explicit Zero-authority check; it was corrected through another real two-worker/reviewer run. No failing acceptance result was hidden.

## Current harmless fixture

Accepted run: `run_1pctb79`; prior run `run_ozq9x04` was superseded after independent inspection found ambiguous README approval language. Both were real provider executions. Final proposed files: `index.html`, `README.md`; both under 15 lines, offline/script-free, and README explicitly reserves approval to Zero. The corrected run reports **63,590** provider tokens. Combined two runs: **127,004** locally recorded reported tokens, 8 starts. These are observed subscription activity, not remaining-account quota or a USD charge.

Review copies, exact SHA-256 hashes and six acceptance results: `artifacts/hardlight/fixture-corrected/`. These copies are verification artifacts, not an apply to the approved target. A fresh read after the latest Telegram requests still found the actual `artifacts/demo-approval-target/` empty. No owner approval was manufactured.

Representative delivered templates from the real workflow include “Zero, work has started on Swarm Subscription Activation…” and “Codex finished a proposal for ‘Prepare HTML review fixture’… nothing has been applied.” These are deterministic summaries of actual events, not invented agent conversation. Exact internal provenance remains in the flight recorder and Telegram delivery journal.

## Artifacts and manual gates

Executable: `artifacts/The Swarm Hardlight.exe`, rebuilt with the receipt/expiry corrections in this checkpoint. Binary SHA-256: `6DA1CD72D54A76595057DD26B11FA877F82B8B11F125AE5AF32F4A88F2ABDB1F`. Native `sendDocument` receipt for the 554-byte public policy report also succeeded. Preserve the prior Telegram executable. Browser evidence: `artifacts/hardlight/{dashboard,models,gallery}-*.png`. Native clip: `artifacts/hardlight/swarm-demo-15s.mp4`; inspected frames `native-capture-frame.png` and `native-recording-indicator.png`.

Latest observed media and approval evidence:

- Native screenshot: `artifacts/hardlight/native-fixture-preview.png`, **957,660 bytes**, artifact `f873ef1e-28d6-4fef-92ac-33fb4ea3a88f`, SHA-256 `4115aadde393ef10b5dacae48ded3df8373ee4cd457937c1a8571a9a09333d72`. The actual sandboxed fixture was visually inspected and shows **Awaiting Zero** / **No files applied**. Native `sendPhoto` status is **sent**; phone receipt is owner-confirmed in chat. The legacy receipt-handler issue and native-audit distinction are documented below.
- Zero-file harmless probe: `bebf80d9-a82a-4aa1-afea-720a4a31cdfc`. Native Telegram request delivery has a **sent** receipt. Zero reported rejecting it, but no matching native audit decision was found at follow-up and the 15-minute request had expired by verification time. This is owner-reported rejection, not a claimed native accepted decision.
- Actual two-file revision: `3cd8cba6-461e-4384-b558-0ee44bac5abc`, for accepted run `run_1pctb79` (`index.html` and `README.md`). HQ sent the request; its original 15-minute authority expired before follow-up. The stale desktop waiting indicator was corrected in `f152c44`. The revision is **high risk**: Telegram approval may record intent, but the exact revision still requires Zero's native confirmation before applying. No approval, intent decision or apply result is claimed.
- The rebuilt executable above includes the receipt and expiry corrections. The original media evidence was captured with the preceding build; this distinction does not imply a new capture or provider run.

Phone photo receipt and video playback are confirmed by Zero. Remaining native-audit checks use the corrected receipt handler and fresh, unexpired approval requests; native high-risk apply remains Zero’s decision only. DeepSeek key entry and first paid authorization remain entirely optional. See the dedicated setup and rollback documents. Fixed native subscription ceilings and disabled external MCP are explicit release limitations, not claimed finished provider integrations.


## Receipt and expiry follow-up

Zero reported that the photo arrived, the 15-second clip played, and the zero-file probe was rejected. Direct native inspection still showed the photo as `sent`, and no matching decision for the old probe. Two distinct conditions were identified: the receipt callback incorrectly accepted only connection-test delivery kinds, and its 15-minute receipt window had elapsed; independently, the change/probe approval authority had expired after 15 minutes. The user's phone confirmation is valid owner-provided evidence and is not being rewritten as a native callback result.

The narrow correction accepts only test/photo/video/document receipt kinds with exact bot/UUID matching, paired-owner/current-receiver checks, one-shot status and a separate 24-hour communication window. Approval authority stays at 900 seconds. The review dialog now checks the absolute native deadline after sleep, disables expired actions and requires explicit fresh review; it never automatically stages or resends. No project files were applied during this follow-up and no inference was needed.

Source checkpoint `f152c44` was built and launched with the binary hash above. All six saved bots reconnected. The original screenshot delivery remains `sent`, eligible for a one-time receipt under the corrected handler. Zero was asked to re-tap its existing button; no duplicate media was uploaded.

Fresh native requests: harmless zero-file probe `7f318368-1f13-44f7-afe6-4bbe2df2a50c` and actual two-file revision `5c405a06-1a12-4340-9f60-5bba294c49b7`, both confirmed `sent`. The latter contains the same accepted `run_1pctb79` files, not another model run. The native dialog shows its explicit expiry and disables Apply while waiting. Neither request has a claimed native decision at this checkpoint. A fresh filesystem read found the target empty. The Telegram browser smoke check also passed after rebuilding.

At follow-up around **13:50 UTC / 06:50 America/Los_Angeles**, Zero reported re-confirming the screenshot and rejecting the fresh probe. The native photo row still read `sent`, and neither fresh approval ID had a matching owner-audit entry. The probe deadline was 13:01:47 UTC and the actual revision deadline 13:03:37 UTC; both had expired by this inspection. The rebuilt desktop correctly displayed **Approval expired** and disabled Apply. All six receivers were still connected and listening. HQ's persisted activity showed an update at 13:49:56 UTC, but transport activity alone does not establish that an authorized callback was accepted. Zero was asked for the exact Telegram responses to distinguish expiry, an older button, or receiver/identity context. No rejection or callback receipt is claimed as native-verified, no new requests were sent automatically, and the target remained empty. Paid APIs remained off.

Zero subsequently reported **Expired request**. One new zero-file probe, `de377957-6abe-4690-818d-043f8c9a4459`, was explicitly sent and confirmed delivered, with a **14:17:39 UTC / 07:17:39 Pacific** deadline. At the later Git handoff inspection it had expired without a matching native rejection audit. The actual two-file request was not renewed. Photo receipt remained owner-reported with native delivery status `sent`; the actual target was still empty. No inference, paid API activation or demo apply occurred during this follow-up.
