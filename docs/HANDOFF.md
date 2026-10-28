# The Swarm engineering handoff — 28 October 2026

Branch: `feat/swarm-upgrade-handoff-2026-10-28`, created from `feat/hardlight-command-center` at `4e54b9a`. It carries the existing upgrade commits and this updated handoff. The application remains Tauri 2 / Rust, React / TypeScript, Zustand and SQLite.

## Owner instructions

- Zero is the founder and the only authority to approve or reject applying a reviewed revision. Pushing this engineering branch is authorized separately; it does not approve the demo proposal.
- Keep paid APIs off. Use supported signed-in subscription CLIs or local Ollama. Never substitute a paid API when a subscription is unavailable.
- Preserve planner, dependency scheduling, workers, reviewer, live graph, verification and review before apply. Extend the existing architecture.
- Telegram carries bounded high-level summaries and explicitly authorized evidence. Keep credentials, raw source, prompts and private account/group identifiers out of Git and Telegram messages.
- Personality is optional, labeled and has no authority. Simulation and recorder replay must not publish real activity, run tools or restore approval authority.

## Delivered code

- Local orchestration with task dependencies, parallel project slots, per-provider queues, usage/call limits, cancellation and recovery. Team Chat links real operational events to their tasks, tool runs and artifacts.
- Immutable native proposal staging, approved-root/path checks, numeric Telegram owner binding, nonce/expiry/replay protections and durable owner decisions. High-risk Telegram approval records intent and requires Zero's native confirmation before writing.
- Model Control with invocation-scoped choices, precedence, manual locks, discovered metadata and unavailable quota states. Generic paid inference remains blocked; the dedicated optional DeepSeek adapter has separate vault, egress, session and budget gates and remains off.
- Eight Hardlight Familiar assets, actual activity states, inspector, gallery, motion settings and responsive dashboard. The assets are static concept art, not rigged 3D characters.
- Six existing Telegram bots, optional local polling, durable offsets, pairing, permission checks, bounded notifications, webhook conflict handling and reserved Ollama/DeepSeek slots. Bot connectivity is separate from AI provider readiness.
- Native capture of only The Swarm window, a scoped 15-second H.264 recording path, immutable media hashes, safe report/import handling and Telegram media delivery. Existing optional webhook/voice functionality is preserved; ordinary Bot API voice calls are not advertised.
- Flight recorder/replay, reported usage tracking, saved runs, Approvals and History views. Interrupted work recovers as stopped; approval authority is never replayed.

## Last verified provider status

| Provider | Evidence and remaining limit |
| --- | --- |
| Codex / ChatGPT subscription | Real inference succeeded. The current fixture used a Codex planner, two independent Codex workers and a Codex reviewer. Internal model identity was not exposed; do not attribute this run to other providers. |
| Cursor Agent CLI | Signed in; approved scratch-directory trust fix passed a real readiness probe. Further inference requires Zero's native confirmation of included usage for a discovered Cursor-owned model. A catalog does not prove entitlement. |
| Claude Code | Authenticated previously, but the last inference check hit its subscription allowance. Recheck availability when needed; no Anthropic API fallback. |
| Google / Antigravity | Installed tooling identified; authenticated, proposal-only adapter execution remains unverified. |
| Grok | Installed tooling identified; subscription entitlement and safe headless execution remain unverified/manual. No xAI API fallback. |
| Ollama | Local discovery and prior real multi-agent inference verified. Not used for the current fixture; no model download is authorized by this handoff. |
| DeepSeek | Native implementation and mocks tested. No key, authenticated balance or paid inference verified. Keep off. |

Subscriptions have separate allowances. Unknown remaining allowance stays unavailable; provider-reported tokens are activity evidence, not remaining quota or a dollar charge. Native ceilings currently include 40 starts per provider per UTC day, 8 starts per task and one concurrent invocation per provider. External MCP execution remains disabled/manual until its server, schema and cost class are verified. macOS capture and secure-entry behavior remain unverified.

## Verification

The tested implementation is source checkpoint `f152c44`; later checkpoints update documentation only.

- TypeScript: **202 passed, 1 skipped**.
- Rust library: **56 passed, 2 ignored**. The ignored inference test is opt-in. The separate installed signed-in metadata test was explicitly run and passed, returning eight models without inference.
- Typecheck, Vite production build and Windows Tauri debug build passed. Vite reports a nonfatal large-bundle warning, approximately 958 KB before gzip.
- Existing UI smoke, Telegram guards and Hardlight responsive checks passed. Telegram smoke was repeated after the receipt/expiry correction. Browser sizes checked: 1440×900, 1920×1080, 1536×864 and 1024×768; this is not a separate native Windows DPI-setting test.
- Independent acceptance of the corrected fixture: **6 passed**, including actual browser rendering. The first fixture failed an explicit owner-authority check and was corrected through another real run.
- The follow-up documentation does not require another inference run or paid test.

Reproduce local checks:

```powershell
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri -- build --debug --no-bundle
```

The Windows debug executable is built at `src-tauri/target/debug/zeropulse-swarm.exe`. The existing local copy is `artifacts/The Swarm Hardlight.exe`, SHA-256 `6DA1CD72D54A76595057DD26B11FA877F82B8B11F125AE5AF32F4A88F2ABDB1F`. Executables, captures, local app data and verification exports are ignored and are not distributed by this Git branch. Build from source on a new checkout.

## Demo and owner approval status

The accepted saved run is `run_1pctb79`, titled **Build a corrected offline approval fixture with two independent workers**. It is real reviewed provider output, not simulated activity. It proposes only `index.html` and `README.md`, each under 15 lines, with no scripts, network calls or dependencies. The README explicitly reserves approval and rejection to Zero.

- Corrected run: 63,590 reported tokens. Two real runs combined: 127,004 reported tokens across eight invocations. No paid API inference was used.
- `index.html` SHA-256: `f1df21afa9e21a81e087144eb25ed1d2e5e892dfdda705771306755e68884030`.
- `README.md` SHA-256: `3e3564f2c36749459be57e89046fb5b1d78ccff42cf5376a4d541ed4b1e368e4`.
- Local review exports are in `artifacts/hardlight/fixture-corrected/`. The actual approved target, `artifacts/demo-approval-target/`, was still **empty** at the latest inspection. Nothing from this proposal has been applied.
- Actual two-file request `5c405a06-1a12-4340-9f60-5bba294c49b7` expired at **06:03:37 Pacific on 28 October**. No matching native owner decision was found. The corrected desktop displays **Approval expired** and disables Apply.
- The latest zero-file probe `de377957-6abe-4690-818d-043f8c9a4459` was sent successfully and expired at **07:17:39 Pacific on 28 October**. At the later inspection there was no matching native rejection audit. Do not mark this probe rejected or issue another automatically.
- Zero reported successful phone photo receipt and playback of the 15-second clip. Native sendPhoto/sendVideo delivery succeeded. The screenshot's callback receipt remains `sent`, not native-confirmed; owner-reported phone evidence is recorded separately.
- Zero reported **Expired request** for the earlier callback check. This is not an accepted approval/rejection. Preserve the distinction between request delivery, phone confirmation and a durable native owner decision.

The receipt fix accepts only matching test/photo/video/document delivery UUIDs from the paired owner through the current bot receiver, once, within 24 hours. It cannot grant approval. Proposal authority remains 900 seconds. The review dialog uses the absolute deadline after sleep/focus changes, blocks expired actions and requires explicit fresh review before staging/sending again.

## Resume safely

Steps 2–5 apply on the original machine where the saved run and approved-root state exist. A fresh clone does not include `run_1pctb79` or the ignored fixture exports. On another machine, use an authorized transfer of the reviewed data or an explicitly requested new demo; do not substitute the older bundled Ollama proposal for this exact revision.

1. Open the desktop build. On **Telegram Bots**, choose **Reconnect saved bots** after restart. Existing local vault entries and numeric pairing persist on this machine; Git does not transfer credentials or pairing to a new machine. Use the supported masked setup/pairing path there.
2. Use the top **Past runs** menu to restore `run_1pctb79`. Do not select **Open recorded Ollama demo**, which is a different, older proposal. Recorder replay is read-only.
3. Inspect Preview, Team Chat, both diffs and the current target contents. Reuse the existing approved target only if still appropriate. Do not run another model task just to renew a decision.
4. When Zero is ready to decide, explicitly review a fresh revision and choose **Ask via Telegram**. This creates a new immutable revision and supersedes old authority. Keep the app open and use the newest request within its 15-minute window.
5. Only Zero presses Reject or records approval intent. For the high-risk HTML proposal, only Zero answers the subsequent native confirmation. No agent may click the owner apply/confirmation controls.
6. If Zero wants another harmless rejection test, send one zero-file probe while Zero is ready, record its exact ID/deadline and verify a matching `rejected` native audit. A Telegram `sent` delivery alone does not prove a decision. Do not extend approval expiry to accommodate delayed replies.
7. If a screenshot receipt still fails, obtain Telegram's exact response and inspect current HQ polling, callback UUID and numeric binding without printing private IDs. Do not weaken owner/chat checks or rewrite the journal based on a chat report.

Native local metadata lives under `%APPDATA%/com.zeropulse.swarm/`: `telegram-bots-v1.json`, `owner-approvals.jsonl`, `subscription-usage.jsonl`, `zeropulse.db` and `approved-media/`. Tokens remain in the OS credential vault. Inspect only the necessary safe fields; never paste these files wholesale into an issue or commit them.

For rollback, preserve the prior local executable and existing vault/data backups. Do not delete app data, reset projects, migrate credentials into `.env`, or reset this checkout to upstream main. See [approval and rollback boundaries](security-and-approval.md).

## Supporting documents

- [Detailed verification and evidence](swarm-upgrade-verification.md)
- [Model controls and subscription limits](model-control-center.md)
- [Telegram evidence workflow](telegram-rich-messaging.md)
- [Optional DeepSeek setup](deepseek-setup.md)
- [Hardlight assets and motion](hardlight-familiars.md)
- [Original baseline](swarm-upgrade-baseline.md)

`LEGACY-README.md` and `TESTING.md` document the older build. Their historical provider/API examples and test counts are superseded by this handoff and the current verification report.
