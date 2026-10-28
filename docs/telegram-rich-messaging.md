# Telegram communication and evidence

The existing six bot identities, numeric owner binding, private group and credential entries are retained. An additive v1 migration adds the reserved DeepSeek slot and saves `telegram-bots-before-hardlight.json` in native app data. Ollama and DeepSeek notifications use HQ until their own bot is configured. **Telegram readiness is independent of inference readiness.** Use **Reconnect saved bots** after restarting; each saved credential is checked with getMe and webhook exclusivity before its poller starts.

Real live run → operational event → deterministic communication intent → readable template → one originating bot (or attributed HQ fallback) → bounded native queue → Telegram receipt. Simulation and replay cannot publish activity. Opaque IDs stay in the native delivery audit. Project names and short subtask titles are bounded and sanitized; source, prompts, model summaries and credentials are excluded. HQ handles workflow summaries and approvals, specialists handle their actual assignments/results. Persisted deduplication, quiet hours, minimum interval, bounded queue/backoff and per-bot permissions remain active. There is no autonomous bot-to-bot reply loop or AI call to create filler prose.

## Evidence workflow

1. Select an approved, harmless project. In Telegram Bots → Evidence, choose **Capture Swarm window**, **Record 15 seconds**, or **Import project evidence**.
2. Capture switches to Mission Control before opening native consent. Windows capture accepts only this process's own Tauri window handle, never a renderer-supplied window or the whole desktop. Recording needs local FFmpeg on PATH; no microphone is used. A global red indicator and Stop control remain available. Resizing, capture failure or cancellation discards a partial clip.
3. Import uses the native file picker and checks the resolved path against the approved project root. Confirm the exact file's sharing in the native dialog. No source archives, executables or arbitrary paths are accepted.
4. Snapshots use fresh UUID names in native app data, SHA-256 digests and immutable metadata. Choose **Send to Telegram**. A native successful upload is labeled *sent*, not phone-confirmed or tested playback.

PNG/JPEG photo uploads are capped at 10 MB; MP4/document uploads at 49 MB (below the documented 50 MB ceiling). MIME and file signatures must match; reports must be UTF-8, ≤256 KB and pass credential/code screening. Captions are fixed summaries, not raw model output. No automatic ambiguous retry uploads private material twice. Inspect failed/uncertain delivery before retrying. Video encoding is H.264/yuv420p, no audio, with fast-start metadata; phone playback must be confirmed on a real device.

Owner-only `/preview`, `/recording` and `/files` retrieve the latest previously authorized snapshot. They cannot initiate a capture, read arbitrary files or expose a server. `/start /help /status /agents /projects /tasks /approvals /pause /resume` retain native numeric-owner and allowed-chat checks. No ordinary Bot API voice-call feature is advertised. Existing optional webhook/voice controls remain available separately; never activate polling and a webhook on one token simultaneously.

Loopback previews work on this PC only. No localhost address is presented as an iPhone link. This upgrade does not publish a tunnel or private repository. External authenticated preview hosting requires separate owner approval.

Sources checked 28 October 2026: [Telegram Bot API file limits and media methods](https://core.telegram.org/bots/api#sending-files), [sendVideo](https://core.telegram.org/bots/api#sendvideo).
