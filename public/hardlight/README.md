# The Swarm — Hardlight Familiars concept asset pack

The live characters now use actual articulated mesh geometry in `src/components/agents/three/`, with reusable GLB hierarchy exports in [models/](models/README.md). The images described below are identity references, explicit fallbacks and static Telegram portraits. They are not the primary 3D characters.

These are **eight static concept crops** from the approved Hardlight Familiars board. They are **not** transparent originals, vector layers, sprite sheets, or rigged 3D/2D characters. Images are upscaled from an illustrated sheet and should be replaced with individually rendered, higher-resolution finals before commercial distribution.

- `avatars_png/`: 512×512 PNG square crops for desktop icons and bot profile uploads.
- `avatars_jpg/`: 512×512 JPEG counterparts for Telegram Bot API `setMyProfilePhoto` static upload compatibility.
- `portraits/`: original tall guardian reference crops.
- `manifest.json`: role assignment, palette, optional Telegram username mapping, state behavior.
- `hardlight_avatar_contact_sheet.png`: thumbnail sheet of actual provided avatar crops.
- `THE_SWARM_CODEX_IMPLEMENTATION_PROMPT.md`: complete next-stage Codex task.

**Use:** Open each Telegram bot in @BotFather, choose `/setuserpic`, select the bot, then supply its avatar. Only change public bot pictures with Zero's explicit approval. Existing bot tokens stay in the local OS credential vault. No new Telegram accounts should be created.

**Current Telegram bot roster:** HQ, Codex, Claude, Gemini, Cursor, Grok. DeepSeek and Ollama have no confirmed Telegram bots yet. Do not invent or register their identities.
