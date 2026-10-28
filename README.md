# The Swarm — Zero’s engineering workspace

An upgrade of the existing **Tauri 2 / Rust / React / Zustand / SQLite** application. The planner → workers → reviewer pipeline, live graph, previews, projects, memory, history, conflict resolution, review-before-apply and verification tools remain in place.

This working copy extends the existing Swarm source; the original source and installed app were not replaced. Start with the [current engineering handoff](docs/HANDOFF.md) for verified behavior, provider limits and the unapplied demo. The original documentation is retained in [docs/LEGACY-README.md](docs/LEGACY-README.md).

## Run

Windows prerequisites: Node 20.19+ or 22.12+, Rust, MSVC build tools and WebView2.

The current handoff branch is `feat/swarm-upgrade-handoff-2026-10-28`, continuing the Telegram and Hardlight upgrades without resetting their history. The local standalone development executable is `artifacts/The Swarm Hardlight.exe`. It embeds the dashboard and runs without a Vite server. Executables and local evidence are ignored by Git; build from source on a new checkout. This is a development build, not a signed installer.

```powershell
npm ci
npm run tauri -- dev              # Full desktop app
npm run dev                       # Browser UI only; cannot apply files or run CLIs
npm run tauri -- build --no-bundle # Standalone release executable
```

The app starts idle. Explicit simulation remains in Settings and is labeled; it does not populate live Team Chat. Existing projects, notes, provider configuration and custom assignments are retained. Original default agent assignments migrate to the new team. Upgraded settings use a separate `zeropulse-swarm/v2` key after reading the original `v1` data, so new provider types do not overwrite settings used by the older app. Generic paid inference is blocked. The separate optional DeepSeek adapter remains off until its native credential, project-egress and paid-session gates are satisfied.

## Short demo walkthrough

1. On the existing machine, use **Past runs** to open the corrected offline approval fixture, `run_1pctb79`. A real Codex planner, two independent workers and a reviewer produced `index.html` and `README.md`. A new checkout does not include private saved-run data; **Open recorded Ollama demo** provides the older bundled real demo, with `index.html` and `styles.css`.
2. Inspect **Team Chat**, **Graph**, workers and **Preview**. Check actual provider attribution and proposed contents. No demo files have been applied to the current target.
3. Click **Review proposal**, choose an **empty demo folder** through the native picker and inspect both diffs.
4. When Zero is ready, choose **Ask via Telegram** for a fresh exact revision. Requests expire after 15 minutes. Only Zero may reject or approve; high-risk Telegram approval records intent and requires Zero's native confirmation. Agents cannot pass an approval flag or impersonate Zero through IPC.
5. After Zero deliberately applies a revision, use the existing **Verify** panel. Open the static demo's `index.html`; real projects retain detected test/build/lint checks and the fix-prompt flow.
6. For a fresh run, connect Ollama under **Integrations**, then choose **Run local demo**. This explicitly selects local agents. Ordinary tasks use assigned providers and never silently fall back from a missing CLI.
7. **Recorder** inspects recorded state without running tools. Interrupted sessions restore as stopped. **Prepare recovery task** prepares a new plan/review cycle; it never restores approval authority.

The current demo remains **unapplied** and its last approval request has expired. Review a fresh revision only when ready to decide. This upgrade does not auto-click owner dialogs.

## Team and subscription setup

| Member | Responsibility | Connection |
| --- | --- | --- |
| Zero | Founder and final authority | Native confirmation or authenticated private Telegram callback |
| ChatGPT through Codex | Chief engineer / planner | `codex login` → Sign in with ChatGPT; `codex exec` |
| Claude Code | Principal engineer / reviewer | Eligible Claude subscription; tools-disabled print mode |
| Gemini | Front end and UI lead | Gemini CLI Google OAuth, plan mode plus deny-all tool policy |
| Cursor | QA and integration | Cursor **Agent CLI**, `agent login`, ask mode; editor command alone is insufficient |
| Grok | Research | Manual only; no verified subscription automation adapter and no xAI API fallback |
| Ollama | Offline support | Local Ollama server; cloud models excluded from Local Only |

Use **Test signed-in CLI** to verify a real response. Finding an executable is not a verified connection. CLIs must support the safety flags in `src-tauri/src/cli.rs`; unsupported versions fail closed. Prompts use stdin, not an interpolated shell command. CLIs run in fresh temporary folders with API-key environment variables removed and return proposed text. Codex forces ChatGPT auth with a read-only sandbox; Claude requires `claude.ai` subscription auth with tools/customizations disabled; Gemini uses Google OAuth and denies tools; Cursor uses ask mode plus explicit [deny permissions](https://cursor.com/docs/cli/reference/permissions) for shell, files, web fetch and MCP tools.

Provider quotas and any provider-configured overage billing still apply. Tokens reported by providers are recorded; estimates are labeled. Subscription cost/remaining quota is unavailable when not reported. API budgets exclude local and subscription traffic.

Verified on this host during the upgrade:

- **Ollama:** real planner → two workers → reviewer passed with `qwen2.5-coder:7b`; recording in `public/demo-run.json`.
- **Codex:** real readiness and two fixture runs succeeded with ChatGPT authentication; the corrected fixture used two workers plus planner/reviewer. See the handoff for reported usage and exact evidence.
- **Claude:** authenticated with Pro, but inference hit the weekly usage limit. The CLI reported reset **October 29, 2026 at 3 p.m. America/Los_Angeles**. No paid API fallback was attempted.
- **Cursor Agent CLI:** installed and signed in; the approved scratch-directory trust fix passed a real readiness probe. Model Control now requires Zero's confirmation of included usage for a discovered Cursor-owned model before further inference. **Google / Antigravity:** installed tooling was identified, but authenticated proposal-only use is unverified. See the current [verification report](docs/swarm-upgrade-verification.md).
- **Grok AI:** manual only. **Telegram:** six real bot identities verified and polling; Zero and the private headquarters group paired. HQ/Codex message receipts and harmless owner approvals are verified in both private and group chats. No project files were applied by these checks.

Official references: [Codex auth](https://developers.openai.com/codex/auth), [Codex noninteractive](https://developers.openai.com/codex/noninteractive), [Claude CLI](https://code.claude.com/docs/en/cli-reference), [Gemini auth](https://geminicli.com/docs/get-started/authentication/), [Gemini policies](https://geminicli.com/docs/reference/policy-engine/), [Cursor headless](https://cursor.com/docs/cli/headless).

## Optional Telegram setup

The dedicated **Telegram Bots** page has HQ, Codex, Claude, Gemini, Cursor, Grok and reserved Ollama and DeepSeek slots. Use your existing bots; no bot creation is needed. **Local long polling** is the default transport. It requires no domain, tunnel, hosting, or paid service.

1. Save HQ's token in its masked credential field, **Test connection** against Telegram `getMe`, then **Start polling**. Repeat for each existing agent bot. Cursor and Grok's provisional identities require native confirmation if the actual username differs.
2. Choose **Pair Zero**, send the one-time command in HQ's private chat, and confirm your captured numeric identity natively. Pair the selected private group using the bot-addressed command shown on screen.
3. Send a test notification from HQ and one agent, then tap **Confirm received** in Telegram. The communications panel distinguishes a successful send from an authenticated receipt.
4. Run the **harmless approval test**. Its revision cannot write files. Decide through HQ's buttons, inspect the audit, and verify that repeating the same callback cannot repeat the action.
5. Run an engineering task for real notifications referencing actual project/task/run/event IDs. Configure permissions, frequency, quiet hours and optional personalities per bot. AI-provider availability remains separate from bot connectivity.

Read the complete [Telegram activation and setup guide](docs/TELEGRAM-SETUP.md) for all six mappings, token replacement/removal, pairing, commands, receiver conflicts, queue/restart behavior and the tested/untested boundary. Tokens stay in Windows Credential Manager, never source, Git, SQLite or frontend persistence. Do not paste them into this conversation. Any token exposed in chat history should be rotated.

The original HTTPS webhook and voice path remains in a folded advanced section. Stop polling before registering a webhook for the same bot; the new native **Disconnect existing webhook** action explicitly handles the reverse migration without exposing credentials. See the guide for its separate legacy credential names. Six identities, polling, owner/private-group pairing, HQ/Codex receipts in private and group chats, and harmless owner approvals in both contexts have now been verified live. The validation report lists the remaining untested paths.

## Execution, owner control and recovery

- **DAG scheduler:** validates cycles, unknown dependencies and duplicate IDs; independent tasks share a bounded pool. Failed dependencies block descendants. Pause gates new work; stop cancels queued work and requests. Review follows settled workers.
- **Real Team Chat:** actual events carry task IDs, model-call IDs and artifact paths. Optional personality is labeled and off by default. “Where’s Zero?” reminders now require a legitimate pending approval, a configurable delay, and a bounded reminder count. They never start work.
- **Owner gate:** immutable proposals bind project, task, run, action and exact staged contents; expire after 15 minutes; and are consumed once. High-risk remote approval records intent and requires native confirmation of that same revision. A newer proposal supersedes older revisions for the same project and run. The backend checks approved roots, paths, sizes and exact reviewed file baselines before writing. Stale files require review again. The old arbitrary `fs_apply(root, files)` IPC path was removed.
- **Flight recorder:** 20 sessions, up to 80 frames each, locally stored with secrets masked. Only the latest frame retains full proposed contents. Recovery restores evidence, not tools or approvals; vendor model sessions are not resumed. Save finished runs controls recording; Clear recordings deletes recovery/replay data.
- **Audit:** owner decisions append to `owner-approvals.jsonl` in app data and appear in the active Team Chat/recorder. Durable authorization is recorded before writes; audit failure blocks a new write. No code or secrets enter the owner audit.
- **Verification:** reviewers receive complete worker output up to a combined 24,000-character limit. Larger proposals must be split and reviewed again; incomplete review cannot unlock approval. AI review is an opinion, not test execution. The existing Verify panel runs actual allowed project scripts per click. Writes are per-file; an I/O failure can leave a partial batch. Approval is consumed, never automatically replayed; inspect and stage a fresh revision.

This protects against model-generated writes and remote Telegram impersonation. It is not an OS isolation boundary against someone controlling Zero’s Windows account, native dialogs or local app data.

## Tests

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml

# Explicit real local inference; saves a proposal only:
$env:SWARM_LIVE_DEMO = '1'
npx vitest run src/__tests__/liveDemo.test.ts
Remove-Item Env:SWARM_LIVE_DEMO

# Explicit real Codex subscription readiness check:
cargo test --manifest-path src-tauri/Cargo.toml subscription_cli_smoke -- --ignored
```

The normal suite includes the original 173 tests plus concurrency/dependency/cancellation, complete review, migration and recorder/recovery coverage. Rust tests cover approval immutability, expiry, superseded revisions, single use, changed baselines, CLI safety/output parsing and Telegram webhook authentication/validation. Real inference is opt-in. `scripts/ui-smoke.cjs` checks the dashboard, recorded demo, native-only apply, replay scrubbing and integration setup with Playwright/Edge (`SWARM_PLAYWRIGHT_PATH` can point at an installed package).

Current upgrade validation: **202 TypeScript tests passed / 1 skipped**, **56 Rust library tests passed / 2 ignored**, production/native builds and browser smoke checks passed. Earlier live activation verified six bot identities/polling, numeric owner/private-group pairing, HQ/Codex receipts and two harmless approvals. Later real Codex workflow messages and native media sends succeeded; phone photo receipt/video playback are owner-confirmed. The latest rejection probe and photo callback are not native-verified, and the proposal remains expired and unapplied. See the [current verification report](docs/swarm-upgrade-verification.md) for dated evidence and manual gaps.

| Area | Implementation |
| --- | --- |
| Existing live pipeline and scheduler | `src/engine/liveDriver.ts`, `scheduler.ts` |
| Roles and subscription adapters | `src/data/team.ts`, `src/providers/cli.ts`, `src-tauri/src/cli.rs` |
| Native approvals and file confinement | `src-tauri/src/approvals.rs`, `fs.rs` |
| Multi-bot Telegram and real-event bridge | `src-tauri/src/telegram_bots.rs`, `src/pages/TelegramBotsPage.tsx`, `src/lib/telegramBridge.ts` |
| Preserved webhook and voice | `src-tauri/src/telegram.rs`, `src/components/swarm/TelegramPanel.tsx` |
| Dashboard and replay | `src/components/swarm/MissionHeader.tsx`, `TeamChat.tsx`, `FlightRecorder.tsx` |
| Persistence and migration | `src/persistence/flightRecorder.ts`, `src/store/app.ts`, `swarm.ts` |

The [legacy README](docs/LEGACY-README.md) and [original testing guide](docs/TESTING.md) describe the pre-upgrade build; their historical verification claims do not apply to new integrations.
# Hardlight command center upgrade

For the latest implementation, verified checks, provider limits and exact unapplied demo status, start with the [engineering handoff — 28 October 2026](docs/HANDOFF.md).

The existing Tauri/Rust + React workspace now includes eight Hardlight Familiars, native evidence capture and Telegram uploads, Model Control, local subscription usage guards and a dedicated opt-in DeepSeek adapter. Generic paid inference APIs are blocked. Existing planning, workers, review, approved-root access, preview and flight recording remain in place.

Start with [the audited baseline](docs/swarm-upgrade-baseline.md), [model controls](docs/model-control-center.md), [Telegram evidence](docs/telegram-rich-messaging.md), [DeepSeek setup](docs/deepseek-setup.md), [artwork and motion](docs/hardlight-familiars.md) and [approval/rollback boundaries](docs/security-and-approval.md). The current verification report is [here](docs/swarm-upgrade-verification.md).

### Short supervised demo

1. Launch `artifacts/The Swarm Hardlight.exe`. Keep the prior executable for rollback. On Telegram Bots choose **Reconnect saved bots**; existing tokens and pairing remain intact.
2. Open **Model Control**, refresh supported catalogs, choose an explicit model/effort or retain a verified CLI default, and set a small task call cap. Unknown remaining subscription allowance is shown as unavailable. Keep DeepSeek OFF unless you deliberately configure and authorize it.
3. Select a harmless approved empty fixture folder. Submit: “Create an offline review fixture. Two workers: QA owns index.html with a semantic heading Awaiting Zero; docs owns README.md describing owner-only apply. Both workers must contribute their own file. No scripts, network or dependencies. Keep each file under 15 lines. Never apply files.”
4. Watch actual assignments, requested/observed model evidence, graph, Team Chat and reviewer. Telegram sends readable summaries of those real events. Open Preview and inspect the generated files. No files are applied by completing a run.
5. On Telegram Bots → Evidence, explicitly authorize a screenshot or 15-second own-window MP4. Inspect the local artifact and choose Send to Telegram. Confirm actual phone playback yourself. `/preview`, `/recording` and `/files` retrieve only already-authorized evidence.
6. Open Review, inspect the exact diff and checks, and ask HQ for approval. Zero alone rejects or approves. High-risk proposals require native confirmation after Telegram intent. Replay and restart never restore approval authority. A rejection must leave the fixture unchanged.

Run `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml --lib`. Build the Windows development executable with `npm run tauri -- build --debug --no-bundle`. Responsive browser checks are `scripts/hardlight-ui-smoke.cjs`, alongside the existing UI smoke scripts; set `SWARM_PLAYWRIGHT_PATH` to an installed Playwright module if needed. Signed-in metadata discovery is an explicit ignored Rust test; subscription inference tests stay opt-in.

