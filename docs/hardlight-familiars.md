# Hardlight Familiars — articulated 3D

The earlier image/CSS implementation was reference-only and did not satisfy living 3D. The live roster, inspector and Mascot Studio now use actual Three.js mesh hierarchies through React Three Fiber. See the detailed [3D acceptance record](hardlight-3d.md) for evidence and remaining device gaps.

Eight procedural characters retain their original identities and provider mappings: golden bee HQ, electric-blue crystalline wolf Codex, ember phoenix Claude, violet-blue fox Gemini, purple cat Cursor, green cyberfox Grok, cyan whale DeepSeek and white/emerald llama Ollama. Their independently moving parts include heads, eyes/lids, ears, jaws, legs/paws, wings/fins and articulated tails as appropriate to each species. These are stylized prototypes rather than artist-sculpted, skinned production rigs.

- Runtime geometry: `src/components/agents/three/{CodexWolf,QuadrupedFamiliars,AerialFamiliars,AquaticFamiliars}.tsx`.
- Pose/quality policies: `src/lib/familiarAnimation.ts`, `familiarPerformance.ts`.
- Shared roster/inspector renderer: `SharedFamiliarScene.tsx`; individual camera studio: `FamiliarStage.tsx`; optional full-team scene: `CommandCenterScene.tsx`.
- Actual-event cues: `src/lib/familiarInteractions.ts` and its read-only observer. No renderer can request inference, grant approval or apply files.
- Reusable GLB hierarchy snapshots and hashes: `public/hardlight/models/`. They contain no image maps, skeletal skins or authored clips; runtime procedural animation lives in source.

Off/Subtle/Full animation is independent of Low/Medium/High/Cinematic quality. Legacy Cinematic motion maps to Full. Medium targets 30 FPS and Low 24; explicit High/Cinematic target up to 60 when hardware permits. The eight-character view limits pixel density, geometry detail and particle budgets. Hidden/offscreen rendering pauses, reduced motion disables autonomous movement, resources are disposed on unmount, and WebGL loss/initialization failure produces labeled fallback media.

Mascot Studio states and its all-eight team mode are explicitly PREVIEW. Real workspace activity is derived from actual worker executions, absolute invocation timestamps, task dependencies and current native approval records. Simulation, replay, saved history, stopped tasks and stale worker flags cannot invent working agents. A model's positive review does not authorize applying files; only Zero decides.

Click a familiar for provider, model/effort provenance, actual invocation evidence and the existing Model Control integration. Quotas and Telegram health remain separate evidence sources. Original PNG/JPEG concepts remain only identity references, static Telegram portraits and clearly labeled fallback images. No real Telegram bot profile photo has been changed.
