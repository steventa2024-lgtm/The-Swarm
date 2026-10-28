# Activate The Swarm's Telegram team

Use the **updated desktop development build**, then open **Telegram** in the sidebar. The browser preview cannot store credentials or receive Telegram updates. Polling runs while the desktop process is open; no hosting, domain, tunnel, or paid service is required.

## The seven slots

| Slot | Expected Telegram identity | Agent assignment |
| --- | --- | --- |
| HQ | `@ZeroPulseSwarmHQBot` | Central coordination and owner decisions |
| Codex | `@ZPSwarmCodexBot` | Chief engineer / planner |
| Claude | `@ZPSwarmClaudeBot` | Principal engineer / backend |
| Gemini | `@ZPSwarmGeminiBot` | Frontend and UI |
| Cursor | `@ZPSwarmCursorBot` provisional | QA and integration |
| Grok | `@ZPSwarmGrokBot` provisional | Research |
| Ollama | Configurable, initially empty | Future offline-support identity |

The first four slots reject a mismatched `getMe` identity. Cursor and Grok show the actual Telegram username and numeric bot ID and require native confirmation when the provisional username differs. Ollama may remain empty. No bots are created by the application.

Telegram identity and model-provider readiness are independent. A connected Codex bot does not prove Codex CLI is authenticated or within quota. Provider readiness remains visible separately.

## Secure token entry

1. Paste each bot's token into **its own masked field**, then choose **Save token**. Start with HQ and one agent, then configure the remaining bots. The field clears before the native request; values never enter Zustand persistence or SQLite settings.
2. Choose **Test connection**. A token existing in Credential Manager is only **Credentials saved**. Actual `getMe` success is required for **Verified**.
3. Verify the actual username and bot ID. Correct mismatches rather than assigning a token to the wrong fixed slot.
4. Choose **Start polling**. Each bot has an independent receiver and durable update offset. Only one Swarm process may hold that bot's receiver lease.
5. If a webhook already exists, choose **Disconnect existing webhook** and confirm the native dialog, then start polling explicitly. Pending Telegram updates are preserved. The app never silently removes a webhook to obtain control.

Tokens are stored in the OS credential store (Windows Credential Manager in this build). The managed bot tokens deliberately have no environment fallback. **Replace token** and **Revoke locally / Remove** cancel the receiver and invalidate verification. Local removal does not invalidate Telegram's token globally; use BotFather to revoke it everywhere. If a token was exposed in chat history, logs, or a source file, rotate it in BotFather.

Do not send tokens in this conversation, put them in project files, or commit them. None are needed for the normal automated tests.

## Pair Zero's numeric account

1. Start HQ polling. In the desktop Telegram page choose **Pair Zero**.
2. Open HQ's private Telegram chat and send the exact `/start CODE` displayed locally.
3. Return to the desktop. Check the captured numeric user and chat IDs and choose **Confirm numeric identity on desktop**. Only Zero should accept that native prompt.
4. Add the configured bots to the intended **private** headquarters group. Let each bot send messages there. Choose **Select private group**, then send the displayed `/pair@ZeroPulseSwarmHQBot CODE` from Zero's account in that group.
5. Confirm the group's numeric ID natively. Public groups with a username are rejected. The owner account and explicitly paired private chat/group are allowlisted; names do not authorize anything.

Pairing codes are random, expire after ten minutes, and require desktop confirmation. Bots ignore messages authored by bots. They do not autonomously reply to one another.

## Prove real delivery and receipt

1. In HQ's card choose **Send test message**. It is labeled a connectivity test, not engineering activity.
2. In Telegram choose **Confirm received** on that message. The communications panel changes the corresponding delivery from **sent** to **received** only after the authenticated return callback.
3. Repeat with at least one agent bot. A successful API send alone is not receipt evidence.
4. Choose **Run harmless approval test**. HQ sends Review / Approve / Reject controls for a unique, short-lived probe. This action has no project files and cannot call the file writer.
5. Approve or reject it from Zero's Telegram account. Inspect the native communications state and `owner-approvals.jsonl` in app data. Try the same button again: it must not perform the action twice.
6. Run an actual engineering task. HQ and the relevant configured agent identities receive fixed summaries containing project, task, run, agent, and event references. Raw model prose, code, filenames, prompts, and logs are excluded.

The working inference demo from the previous upgrade remains available. Opening saved output or scrubbing replay never publishes it as new work.

## Commands, notifications, and approvals

`/start`, `/help`, `/status`, `/agents`, `/projects`, `/tasks`, `/approvals`, `/pause`, and `/resume` operate only for the allowlisted numeric owner in the selected chats. In a group, address the intended bot, for example `/status@ZeroPulseSwarmHQBot`.

Workspace commands return bounded IDs and real states. Pause/resume is sent to the actual live desktop controller, bound to that run, and acknowledged only after its result. A stale or unavailable controller, a replay, or an absent live workflow is reported as unavailable.

HQ handles approval buttons. Each revision binds immutable staged contents, approved root, run, project, task, action, expiry, and native risk classification. Review identifies the exact proposal; it grants no authority. Rejected, expired, consumed, superseded, or pre-restart revisions cannot be reused. Unknown and executable changes are high risk. Telegram can record intent for high-risk changes; **Confirm staged revision on desktop** must authorize the same immutable revision before writing. Every owner decision is audited; durable authorization is recorded before a writer runs.

Configure individual bot permissions, task notifications, critical alerts, frequency, quiet hours, and personality wording on the Telegram page. Quiet hours use the explicitly labeled UTC clock. The event queue and deduplication are bounded. Delivery states distinguish queued, sent, received, suppressed, and failed. API authentication failures, rate limits, network outages, and competing receivers are shown without exposing Telegram's token-bearing URLs.

**Where's Zero?** is optional personality text, only while an actual approval remains pending, after the configured delay and with a maximum reminder count. It never starts tasks and is not evidence of work. The old unrestricted inactivity timer has been replaced by this approval-specific policy.

## Preserved HTTPS webhook and voice path

The folded **Existing HTTPS webhook and voice setup** section retains the previous single-HQ webhook receiver and voice controls. Its legacy credential names remain separate. Use one delivery method per bot. New polling checks `getWebhookInfo`; the legacy webhook checks active managed polling before registering. A webhook installation still needs its original HTTPS endpoint and secret-token configuration. Telegram polling requires neither.

Incoming voice remains local playback in the existing webhook path. Voice cannot approve actions, and no automatic transcription or external AI upload is enabled.

## Recovery and practical limits

Bot names, permissions, numeric identity metadata, pairing bindings, offsets, bounded delivery diagnostics, deduplication, and queued event references are nonsecret local data in `telegram-bots-v1.json` in app data. Credentials remain in the OS store. Receiver locks are OS-held and released on crash. Reopen the desktop and explicitly start the bots after restart; there is no hidden Windows service.

Polling commits offsets before dispatch to prevent an interrupted action from replaying. A crash between that commit and dispatch can lose that update; inspect the pending proposal and request a fresh notification. The app does not claim exactly-once Telegram delivery across network uncertainty. Approval authority remains one-use and revoked after process restart.

## Verification report

Automated coverage includes identity mismatch, allowlists, bot permission boundaries, independent offsets and restart, failed checkpoint rollback, token lifecycle invalidation, notification deduplication, bounded backoff/quiet hours, safe error handling, native approval races/expiry/replay, durable audit failures, frontend secure credential failures, real-event routing, stale command rejection, and replay exclusion.

The dashboard and configuration page have browser checks; the desktop build is compiled with the same native handlers. **All six identities and polling receivers are verified live. Zero completed private-account pairing, HQ and Codex message receipts were confirmed, and the harmless HQ probe was approved and recorded in the native audit. Private-group access still requires Zero's group pairing.** No live Telegram success has been inferred from mock tests. Codex's initial HTTP 400 send was resolved by starting its private chat and retrying successfully.

Official protocol reference: [Telegram Bot API](https://core.telegram.org/bots/api), including `getMe`, `getUpdates`, `getWebhookInfo`, and `deleteWebhook`.
