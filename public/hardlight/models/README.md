# Articulated Hardlight model exports

These eight GLB 2.0 files are original free procedural geometry exported from the actual running Three.js character rigs. No portrait image is mapped onto a model; manifest image counts are zero. No paid generation API, purchased asset pack or external character subscription was used.

The runtime source lives in `src/components/agents/three/`: CodexWolf, QuadrupedFamiliars, AerialFamiliars and AquaticFamiliars. It owns the named articulated hierarchies, shared geometry/material resources and cleanup. `src/lib/familiarAnimation.ts` supplies procedural poses and smooth transitions. JavaScript modules and per-rig resources are reused rather than repeatedly loading remote models.

The GLBs are reusable authoring/rest-pose snapshots with independently editable named mesh nodes. They are not skinned production models and contain no authored animation clips or morph targets. Runtime animation is procedural source code, not embedded in these GLBs. They may be opened in Blender or another compatible model viewer for further art development.

Reproduce the export with the local development app on port 1421 and `scripts/export-familiar-models.cjs` (set SWARM_PLAYWRIGHT_PATH to an installed Playwright module). The script first writes ignored exports under `artifacts/3d/models/`; inspect them before copying approved results here. `manifest.json` records byte counts and SHA-256 hashes.

Original PNG/JPEG concepts elsewhere under `public/hardlight/` remain visual references, Telegram portraits and explicitly labeled fallback media. They are not the primary 3D characters.
