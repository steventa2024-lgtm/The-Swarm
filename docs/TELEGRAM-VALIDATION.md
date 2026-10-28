# Telegram activation validation

Historical activation snapshot for `feat/telegram-multi-bot`, before the Hardlight upgrade and GitHub handoff. Counts, seven-slot UI and local-only publication status below describe that stage. Use [HANDOFF.md](HANDOFF.md) and the [current verification report](swarm-upgrade-verification.md) for the latest state.

At this snapshot, the development branch was `feat/telegram-multi-bot` in the existing repository history, and no upgrade changes had yet been pushed to GitHub.

## Tested

- 192 TypeScript tests pass, including the original application regression suite. One real-inference test is intentionally opt-in.
- 40 Rust tests pass; one subscription readiness probe is intentionally opt-in.
- TypeScript checking and Vite production build pass. The existing large-chunk size warning remains nonblocking.
- Standalone Tauri development executable built: `artifacts/The Swarm Telegram.exe`.
- Both Playwright browser smoke scripts pass: dashboard, real saved demo, browser-native boundary, replay scrubbing, integration navigation, seven Telegram slots, masked credential fields and disabled browser-only credential actions.
- Native executable launched and its Telegram page inspected. After Zero saved the credentials locally, real Telegram `getMe` checks passed for HQ, Codex, Claude, Gemini, Cursor and Grok. All six independent polling receivers showed Connected and listening. Ollama remains an unconfigured reserved slot.
- Zero completed native numeric-account pairing. Live connection-test messages from HQ and Codex reached the paired private chat; both authenticated receipt callbacks were recorded as received. Zero approved the harmless HQ probe and the durable audit recorded `owner_authorized` followed by `approved_probe`; the pending revision was consumed without calling a project writer.
- Zero also completed native pairing for the private headquarters group. HQ and Codex group sends and authenticated receipt callbacks succeeded. A separate harmless group approval probe completed as `approved_probe`. The final records contain two HQ receipts and two Codex receipts across private and group contexts, plus two distinct approved probes. No project files were applied.
- Native coverage includes identity mismatch/nonbot rejection, owner/chat allowlists, per-agent approval restrictions, independent persisted offsets, failed offset rollback, process receiver leases, bot-addressed commands, webhook conflicts, safe error classification, token lifecycle invalidation, managed-credential command restrictions, quiet hours and bounded backoff/deduplication.
- Approval coverage includes immutable project/task/action context, exact staged readback, racing decisions, one-use/expiry/restart revocation, stale file baselines, high-risk remote intent, harmless probe, and durable audit failure blocking writes.
- Frontend coverage includes secure-store failures, unavailable native transport, event privacy/routing, replay exclusion, stale remote controls, actual controller acknowledgements, and exact-revision Review without granting approval.

## Live activation evidence

| Check | Current evidence |
| --- | --- |
| Six real bot tokens saved in Credential Manager | Saved directly by Zero through the masked desktop fields; six credential slots confirmed |
| Actual numeric bot IDs and usernames from `getMe` | All six verified against real Telegram responses |
| Cursor/Grok provisional username confirmation | Actual usernames match `@ZPSwarmCursorBot` and `@ZPSwarmGrokBot`; no identity mismatch prompt needed |
| Numeric owner pairing | Zero completed the private-chat pairing and native confirmation |
| Private headquarters group pairing | Zero completed the group command and native numeric-group confirmation |
| HQ and one agent message delivery | Real HQ and Codex connection tests sent successfully |
| Authenticated receipt return path | Both HQ and Codex test messages have received callbacks from the paired owner |
| Group delivery and receipts | HQ and Codex group sends and receipt callbacks confirmed; a fresh HQ check resolved the initially unconfirmed receipt |
| Harmless approval round trip | Zero approved the live HQ probe; durable `approved_probe` audit confirms completion with no files |
| Group approval round trip | A second harmless probe in the paired group was approved and audited without any project files |
| Duplicate/expired/unauthorized callback rejection | Automated native tests pass; no live adversarial callbacks were fabricated |
| Real network disconnect, rate limiting and webhook migration | Logic tested; real-service fault injection not performed |

No token values were read, echoed, or copied by the agent. Bot identities, polling, owner and private-group pairing, HQ/Codex message receipts in both contexts, and harmless owner approvals in both contexts are verified live. Zero personally performed each authorization binding, receipt confirmation and approval. The first Codex private send returned HTTP 400 before its private chat was started; after Zero pressed Start, the retry and receipt succeeded. A fresh HQ group check obtained the previously missing receipt. Automatic delivery of a fresh engineering workflow to the group has not been separately exercised; group posting from the other four agent identities and live adversarial/restart fault tests are also unverified. Those boundaries are not inferred from connectivity tests.

## Operational limits

- The desktop must be running. No background Windows service is installed. Start polling explicitly after restart; numeric pairing bindings, offsets, bounded delivery queue and deduplication persist.
- An in-flight long poll may hold its OS receiver lease for up to the request timeout after Stop or Replace. Authority is revoked immediately; wait for the request to drain before restarting.
- Queue capacity is 200, delivery history 100, and deduplication history 1,000 entries. Quiet hours are explicitly UTC. Network uncertainty can prevent proof of delivery; sent and received are separate states.
- Offsets are durable before dispatch, so a crash in between can lose an update. An approval is never automatically replayed; review and notify a fresh revision if necessary.
- Managed tokens use only the OS credential store. Token removal revokes this app's access; BotFather is required for global Telegram token revocation.
- The existing webhook/voice implementation is retained as a separate advanced transport. New multi-bot polling does not add automatic voice transcription.
- High-risk Telegram approvals record intent and still require native desktop confirmation of the same immutable staged revision. The harmless probe has no project files.

Follow [TELEGRAM-SETUP.md](TELEGRAM-SETUP.md) for the live activation steps.
