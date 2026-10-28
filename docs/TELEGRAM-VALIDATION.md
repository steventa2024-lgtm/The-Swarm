# Telegram activation validation

Development branch: `feat/telegram-multi-bot` in the existing repository history. Source baseline includes the preceding local Swarm upgrade. Nothing has been pushed to GitHub.

## Tested

- 192 TypeScript tests pass, including the original application regression suite. One real-inference test is intentionally opt-in.
- 40 Rust tests pass; one subscription readiness probe is intentionally opt-in.
- TypeScript checking and Vite production build pass. The existing large-chunk size warning remains nonblocking.
- Standalone Tauri development executable built: `artifacts/The Swarm Telegram.exe`.
- Both Playwright browser smoke scripts pass: dashboard, real saved demo, browser-native boundary, replay scrubbing, integration navigation, seven Telegram slots, masked credential fields and disabled browser-only credential actions.
- Native executable launched and its Telegram page inspected. All seven slots correctly show Not configured, no successful activity, and no fabricated Telegram connection.
- Native coverage includes identity mismatch/nonbot rejection, owner/chat allowlists, per-agent approval restrictions, independent persisted offsets, failed offset rollback, process receiver leases, bot-addressed commands, webhook conflicts, safe error classification, token lifecycle invalidation, managed-credential command restrictions, quiet hours and bounded backoff/deduplication.
- Approval coverage includes immutable project/task/action context, exact staged readback, racing decisions, one-use/expiry/restart revocation, stale file baselines, high-risk remote intent, harmless probe, and durable audit failure blocking writes.
- Frontend coverage includes secure-store failures, unavailable native transport, event privacy/routing, replay exclusion, stale remote controls, actual controller acknowledgements, and exact-revision Review without granting approval.

## Awaiting Zero's secure setup

| Check | Current evidence |
| --- | --- |
| Six real bot tokens saved in Credential Manager | Tokens not entered during implementation |
| Actual numeric bot IDs and usernames from `getMe` | Unverified until each token is tested |
| Cursor/Grok provisional username confirmation | Requires actual Telegram response and Zero's native confirmation |
| Numeric owner and private-group pairing | Requires Zero to send the one-time commands and confirm natively |
| HQ and one agent message delivery | No live test message has been sent |
| Authenticated receipt return path | Requires Zero's Confirm received buttons |
| Harmless approval round trip and duplicate button rejection | Implemented and unit tested; live owner interaction pending |
| Real network disconnect, rate limiting and webhook migration | Logic tested; real-service fault injection not performed |

No tokens, owner identities, receipts, messages, or approvals have been invented. Real Telegram success should be reported only after those native checks and user interactions are observed.

## Operational limits

- The desktop must be running. No background Windows service is installed. Start polling explicitly after restart; numeric pairing bindings, offsets, bounded delivery queue and deduplication persist.
- An in-flight long poll may hold its OS receiver lease for up to the request timeout after Stop or Replace. Authority is revoked immediately; wait for the request to drain before restarting.
- Queue capacity is 200, delivery history 100, and deduplication history 1,000 entries. Quiet hours are explicitly UTC. Network uncertainty can prevent proof of delivery; sent and received are separate states.
- Offsets are durable before dispatch, so a crash in between can lose an update. An approval is never automatically replayed; review and notify a fresh revision if necessary.
- Managed tokens use only the OS credential store. Token removal revokes this app's access; BotFather is required for global Telegram token revocation.
- The existing webhook/voice implementation is retained as a separate advanced transport. New multi-bot polling does not add automatic voice transcription.
- High-risk Telegram approvals record intent and still require native desktop confirmation of the same immutable staged revision. The harmless probe has no project files.

Follow [TELEGRAM-SETUP.md](TELEGRAM-SETUP.md) for the live activation steps.
