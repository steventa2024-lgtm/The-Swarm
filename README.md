# The Swarm — Zero’s engineering workspace

An upgrade of the existing **Tauri 2 / Rust / React / Zustand / SQLite** application. The planner → workers → reviewer pipeline, live graph, previews, projects, memory, history, conflict resolution, review-before-apply and verification tools remain in place.

This is a source copy of `C:\Users\steve\OneDrive\Desktop\The Swarm by ZeroPulse`. The original source and installed app were not changed. The original documentation is retained in [docs/LEGACY-README.md](docs/LEGACY-README.md).

## Run

Windows prerequisites: Node 20.19+ or 22.12+, Rust, MSVC build tools and WebView2.

This workspace also includes a compiled standalone development executable at `artifacts/The Swarm.exe`. It embeds the dashboard and runs without a Vite server. It is a development build, not a signed installer.

```powershell
npm ci
npm run tauri dev                 # Full desktop app
npm run dev                       # Browser UI only; cannot apply files or run CLIs
npm run tauri build -- --no-bundle # Standalone release executable
```

The app starts idle. Explicit simulation remains in Settings and is labeled; it does not populate live Team Chat. Existing projects, notes, provider configuration and custom assignments are retained. Original default agent assignments migrate to the new team. Upgraded settings use a separate `zeropulse-swarm/v2` key after reading the original `v1` data, so new provider types do not overwrite settings used by the older app. Paid APIs are off on every launch and require native owner confirmation to enable for that session.

## Short demo walkthrough

1. Open **Open recorded Ollama demo** in the desktop app. This is real output captured by the opt-in integration test, not a simulation. A planner decomposed the task, separate backend and frontend agents produced files, and a reviewer checked them.
2. Inspect **Team Chat**, **Graph**, workers and **Preview**. The proposal contains `index.html` and `styles.css` for a small Swarm page. No demo files have been applied to a project.
3. Click **Review proposal**, choose an **empty demo folder** through the native picker and inspect both diffs.
4. Click **Zero: approve & apply**. Only Zero should answer the native confirmation. Cancel rejects the revision. Agents cannot pass an approval flag or impersonate Zero through IPC.
5. Use the existing **Verify** panel after applying. Open the static demo’s `index.html`; real projects retain detected test/build/lint checks and the fix-prompt flow.
6. For a fresh run, connect Ollama under **Integrations**, then choose **Run local demo**. This explicitly selects local agents. Ordinary tasks use assigned providers and never silently fall back from a missing CLI.
7. **Recorder** inspects recorded state without running tools. Interrupted sessions restore as stopped. **Prepare recovery task** prepares a new plan/review cycle; it never restores approval authority.

The final demo apply is deliberately waiting for **your approval**. This upgrade does not auto-click owner dialogs.

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
- **Codex:** a real readiness response succeeded with ChatGPT authentication.
- **Claude:** authenticated with Pro, but inference hit the weekly usage limit. The CLI reported reset **October 29, 2026 at 3 p.m. America/Los_Angeles**. No paid API fallback was attempted.
- **Gemini CLI / Cursor Agent CLI:** not installed here; adapters implemented but real inference unverified. The Cursor desktop editor is installed.
- **Grok:** manual only. **Telegram:** no credentials supplied; not connected.

Official references: [Codex auth](https://developers.openai.com/codex/auth), [Codex noninteractive](https://developers.openai.com/codex/noninteractive), [Claude CLI](https://code.claude.com/docs/en/cli-reference), [Gemini auth](https://geminicli.com/docs/get-started/authentication/), [Gemini policies](https://geminicli.com/docs/reference/policy-engine/), [Cursor headless](https://cursor.com/docs/cli/headless).

## Optional Telegram setup

1. Create a bot with **@BotFather**, then start its private chat. Obtain your numeric user ID and private chat ID through a trusted Telegram client/bot workflow. Group chats are rejected.
2. In **Integrations → Telegram**, save `TELEGRAM_BOT_TOKEN` and a separate random `TELEGRAM_WEBHOOK_TOKEN` (32–256 letters, digits, `_` or `-`). Secrets use Windows Credential Manager with environment fallback; entry fields clear after saving and secrets are never persisted in frontend settings. Do not paste them into tasks or source files.
3. Expose only `http://127.0.0.1:9462/telegram/webhook` through an HTTPS reverse proxy/tunnel. Preserve `X-Telegram-Bot-Api-Secret-Token` and configure a short body-read timeout at the proxy. Do not expose Vite, IPC or other local services.
4. Enter Zero’s IDs and `https://your-host/telegram/webhook`, then **Register webhook**. Zero confirms the binding natively. “Webhook registered” means Telegram accepted registration; send `/status` in the private chat to verify actual delivery. Registration failures remain visible.
5. Review a completed proposal in the app, then **Ask via Telegram**. The bot sends a file count and opaque revision ID with **Approve & apply** / **Reject** buttons. Automatic messages contain no prompts, code, filenames, credentials or model-written summaries.
6. Send a voice note to the bot; **Refresh status & inbox** and play it locally. For outbound voice, select and preview an OGG/MP3/M4A under 5 MB and confirm natively. Voice never authorizes changes and is not automatically transcribed or sent to AI services.
7. Disconnect revokes local authority and removes the remote webhook. Local authority is revoked even if remote removal fails. Reconnect after restarting the app; old approval buttons are revoked.

Webhook validation checks the shared secret, exact numeric sender, private chat, body size, callback shape and single-use revision. Duplicate updates are acknowledged without repeating actions; a repeated approval cannot apply twice. `/status`, `/start`, `/help`, voice and revision buttons are supported. Arbitrary text never executes commands or grants approval. [Telegram Bot API documentation](https://core.telegram.org/bots/api).

## Execution, owner control and recovery

- **DAG scheduler:** validates cycles, unknown dependencies and duplicate IDs; independent tasks share a bounded pool. Failed dependencies block descendants. Pause gates new work; stop cancels queued work and requests. Review follows settled workers.
- **Real Team Chat:** actual events carry task IDs, model-call IDs and artifact paths. Optional personality is labeled and off by default. “Where’s Zero?” appears after 15 minutes without input while Team Chat is open, with both toggles enabled. It never starts work.
- **Owner gate:** immutable proposals expire after 15 minutes and are consumed once. A newer proposal supersedes older revisions for that run. The backend checks approved roots, paths, sizes and exact reviewed file baselines before writing. Stale files require review again. The old arbitrary `fs_apply(root, files)` IPC path was removed.
- **Flight recorder:** 20 sessions, up to 80 frames each, locally stored with secrets masked. Only the latest frame retains full proposed contents. Recovery restores evidence, not tools or approvals; vendor model sessions are not resumed. Save finished runs controls recording; Clear recordings deletes recovery/replay data.
- **Audit:** owner decisions append to `owner-approvals.jsonl` in app data and appear in the active Team Chat/recorder. No code or secrets enter the owner audit.
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

Upgrade validation: **184 TypeScript tests passed**, **19 Rust tests passed** (one subscription probe deliberately opt-in), the real two-agent Ollama integration demo passed, the Codex subscription readiness probe passed, and the browser smoke test and standalone desktop build succeeded. Native owner confirmations and live Telegram delivery await Zero's interaction and credentials; they were not auto-confirmed or represented as tested live.

| Area | Implementation |
| --- | --- |
| Existing live pipeline and scheduler | `src/engine/liveDriver.ts`, `scheduler.ts` |
| Roles and subscription adapters | `src/data/team.ts`, `src/providers/cli.ts`, `src-tauri/src/cli.rs` |
| Native approvals and file confinement | `src-tauri/src/approvals.rs`, `fs.rs` |
| Telegram and voice | `src-tauri/src/telegram.rs`, `src/components/swarm/TelegramPanel.tsx` |
| Dashboard and replay | `src/components/swarm/MissionHeader.tsx`, `TeamChat.tsx`, `FlightRecorder.tsx` |
| Persistence and migration | `src/persistence/flightRecorder.ts`, `src/store/app.ts`, `swarm.ts` |

The [legacy README](docs/LEGACY-README.md) and [original testing guide](docs/TESTING.md) describe the pre-upgrade build; their historical verification claims do not apply to new integrations.
