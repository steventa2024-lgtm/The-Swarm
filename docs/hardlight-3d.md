# Hardlight 3D correction — acceptance record

This work continues locally on `feat/swarm-upgrade-handoff-2026-10-28`. The previous static-image familiar implementation did not satisfy the requested living 3D experience. Its artwork is retained only as identity reference, explicit fallback and Telegram portrait material. No new work has been pushed or merged during this correction.

## Stage A evidence

Codex is a genuine procedural 3D wolf with volumetric head/muzzle, articulated jaw, eyelids, ears, chest, four jointed legs/paws and segmented tail. Its named hierarchy is in `src/components/agents/three/CodexWolf.tsx`; the pure pose controller is in `src/lib/familiarAnimation.ts`.

Automated browser acceptance found 181 meshes with three-dimensional bounds approximately 1.29 × 2.75 × 3.79 world units, no image texture maps or portrait planes on the character, independently changing joint transforms and real front/side/rear camera positions. Motion Off, system reduced motion and offscreen checks produced exact zero joint deltas after settling. Forced WebGL loss displayed a labeled fallback, and task navigation remained usable.

The real browser viewport was recorded through Chromium screencast frames while camera controls and state-preview controls were operated. Installed FFmpeg encoded the captured frames into `artifacts/3d/codex-wolf-stage-a.mp4`: H.264, 1600 × 1150, 30 FPS, approximately 22.57 seconds. This is actual animated renderer output, not a slideshow or generated video. The recording clearly labels states as previews; no agent task or inference was run for it.

The automated environment explicitly uses SwiftShader software WebGL. Separate samples ranged from 12 FPS under concurrent software tests to 30–31 FPS in the recording at Medium quality. These are not hardware GPU benchmarks and do not establish 60 FPS on Windows or a Mac mini M4.

Evidence is local and ignored by Git: `artifacts/3d/stage-a-acceptance.json`, camera-angle screenshots, `recording.json` and the MP4. Reproduce checks with `scripts/codex-3d-smoke.cjs`; `scripts/record-codex-3d.cjs` captures actual viewport frames. Set `SWARM_PLAYWRIGHT_PATH` to an installed Playwright module and run the local Vite preview on port 1421.

## Architecture and boundaries

- React Three Fiber / Three.js render real closed mesh geometry. Drei provides bounded perspective-camera orbit controls and scissored views sharing one renderer for the live roster and inspector.
- Models use named articulated hierarchies and procedural animation, not image planes. Geometry/material resources are reused within each rig and disposed on unmount. GLB exports preserve the editable hierarchy; animation behavior remains in source rather than authored skeletal animation clips.
- State sampling never creates work. Simulation, history and recorder replay cannot claim current agent activity. HQ waits only for a matching, unexpired native file-approval record. Personality motion is not evidence of inference.
- Viewport visibility, document visibility, animation preferences, reduced motion, quality budgets and demand rendering control scheduling. Large High/Cinematic views may use controlled bloom; compact views avoid that cost.
- Rendering code does not stage, approve, apply, invoke providers, publish Telegram messages or change bot profiles. Existing native approval, Telegram, DeepSeek and CLI boundaries remain in place.

## Artistic limitations

These are original procedural prototypes with stylized hard-surface geometry. They are not artist-sculpted production models, physically simulated creatures or fully skinned Blender rigs. Articulation uses independent mesh nodes; locomotion is a localized gesture rather than world-space pathfinding. Existing reference portraits are more detailed than these meshes. Device-specific hardware performance and macOS runtime behavior require direct testing on those machines.

Full acceptance remains in progress until all eight rigs, dashboard integration, real-event interactions, native build and the performance/fallback checks are recorded below. Stage A passing does not mark the whole correction complete.

## Implementation sources

- [React Three Fiber Canvas and demand rendering](https://r3f.docs.pmnd.rs/api/canvas)
- [Drei shared scissored views](https://drei.docs.pmnd.rs/portals/view)
- [Controlled selective bloom](https://react-postprocessing.docs.pmnd.rs/effects/bloom)

## Stages B–E: current results

All eight models and the dashboard integration are implemented. Measured Medium-quality mesh counts in the actual browser renderer:

| Character | Creature | Actual meshes | Runtime source | GLB |
| --- | --- | ---: | --- | --- |
| HQ | Golden bee | 131 | AerialFamiliars.tsx | hq.glb |
| Codex | Blue crystalline wolf | 181 | CodexWolf.tsx | codex.glb |
| Claude | Ember phoenix | 200 | AerialFamiliars.tsx | claude.glb |
| Gemini | Violet-blue twin-tail fox | 121 | QuadrupedFamiliars.tsx | gemini.glb |
| Cursor | Purple cat | 122 | QuadrupedFamiliars.tsx | cursor.glb |
| Grok | Green cyberfox | 115 | QuadrupedFamiliars.tsx | grok.glb |
| DeepSeek | Cyan whale | 85 | AquaticFamiliars.tsx | deepseek.glb |
| Ollama | White/emerald llama | 132 | AquaticFamiliars.tsx | ollama.glb |

Sources are under `src/components/agents/three/`; the eight GLB exports total **463,560 bytes** under `public/hardlight/models/`. Every export has zero images. Their manifest records hashes, node counts and the absence of embedded clips/skins.

`AgentMascot` now renders a real scissored 3D view, with explicit static fallback on failure. `FamiliarRoster` preserves provider, project, latest-invocation/model and inspector integrations. The roster and expanded inspector share one WebGL context. The optional command center uses one world renderer; opening its separate inspector pauses the background world. Mascot Studio includes individual inspection and an explicitly labeled all-eight team preview.

Typed task cues come from actual invocation starts, task dependencies, artifact producers, reviewer completion and valid native pending approval records. Absolute worker epochs preserve freshness after pauses without altering existing progress offsets. Context changes baseline old events instead of replaying them. Stopped/failed tasks and terminal snapshots cannot animate stale working flags. Unknown providers and same-provider transfers cannot invent cross-provider activity. HQ approval cues are coordination only and cannot authorize a write.

### Browser acceptance

- All eight rigs have volumetric geometry, named independent joints, working gaze/blinks/appendages and no portrait planes or image maps.
- All eight animate together in the labeled Studio preview. Off/reduced-motion checks produced exact zero joint deltas for each character.
- Shared inspector orbit, actual mesh-click selection, exact camera preset reset and safe zoom bounds passed. Presets now discard prior orbit damping momentum.
- Three world/roster cycles retained one Canvas, world geometry counts **90/90/90**, roster counts **89/89/89** and zero scene textures in that test. Initial WebGL-disabled startup produced eight labeled fallbacks with navigation usable. Forced Studio, roster and world context-loss tests also passed.
- Four responsive layouts passed, including an actual browser deviceScaleFactor of 1.25. This is not a native Windows DPI or Mac measurement.
- Browser JS heap after explicit GC measured **56,129,696 → 61,102,944 → 61,889,192 → 63,227,324 bytes** across warm-up/navigation. This is an observed sample, not proof of zero leaks or a native WebView/process memory measurement.
- Headless SwiftShader team recording observed **16 render FPS**; quality-switch observations were **10–15 FPS**. Software rendering does not verify 60 FPS on either target device. Medium defaults to a 30 FPS budget, Low 24; High/Cinematic can target 60 with bounded eight-view pixel/detail budgets. Whole-world quality switches reuse their renderer; context antialiasing is chosen at creation, while pixel density, frame budget and effects adjust.

Evidence: `artifacts/3d/all-familiars-acceptance.json`, `team-preview-acceptance.json`, `performance-memory.json`, screenshots and **eight-team-preview.mp4** (actual 11.92-second viewport recording, H.264). Reproduce with `scripts/familiars-3d-smoke.cjs`, `team-preview-smoke.cjs`, `familiar-memory-smoke.cjs` and the updated `hardlight-ui-smoke.cjs`. These checks do not run inference.

### Real activity verification

A disposable browser context ran an actual on-device Ollama workflow through visible application controls: `run_byhxcal`, four `qwen2.5-coder:7b` calls, QA plus documentation workers, then reviewer. Planning, running, reviewing and completed phases were observed with corresponding actual Ollama character states; the other provider characters stayed offline. Reported usage was **2,505 tokens**. No state was injected, no external service was contacted, no native IPC was used, and nothing was applied.

The actual 16.03-second H.264 recording is `artifacts/3d/local-task/real-ollama-3d.mp4`; metadata and phase observations are in `report.json`. The renderer briefly displayed the prior completed pose before the working reviewer's reviewing state settled; the later matching reviewing observation is preserved. The activity test also exposed stale pre-resolution model labels: requests/IDs used the selected 7B model while some labels retained routing defaults. The source now uses resolved model labels in request events and model-neutral pre-resolution messages; a dedicated regression passed. The earlier recording/report remain unchanged as evidence of that issue.

The generated HTML exceeded the requested line target (12 lines; README 8). AI reviewer approval is not independent fixture acceptance. This was an animation/activity test, not an approved project patch; its files were never staged or applied to the real target. The earlier approved-root target remains empty.

`verify-3d-local-task.cjs` deliberately performs real local inference when explicitly invoked; it is outside the normal unit suite. It uses an isolated browser profile and leaves the desktop user's provider choices and agent assignments unchanged. No further real inference is required to review this implementation.

### Regression and build

- Final TypeScript: **227 passed, 1 skipped** across 28 files.
- Rust library: **56 passed, 2 ignored**; opt-in inference was not rerun.
- Typecheck, production frontend build and Windows Tauri debug build passed. The existing nonfatal chunk-size warning remains; heavy 3D code is split from the base interface.
- Latest built binary: `src-tauri/target/debug/zeropulse-swarm.exe`, SHA-256 **287C189E2B9AC6CE52A9E3ED47DB0E09B8B1752A22D8A30195B95AF055391E11**.
- `artifacts/The Swarm 3D.exe` is the earlier launched 3D build, not the final source snapshot. Close earlier Swarm windows before launching the latest output. Previous Hardlight/Telegram executables are preserved.
- Native approval, Telegram, DeepSeek, model controls, local-only policy and other existing regression coverage remain passing. No paid API was enabled, no owner decision was automated, no bot photo was changed, and no 3D change has been pushed or merged.

### Optional Telegram recording path

Studio has an explicit **Record actual 3D window MP4** action for labeled previews. The live workspace enables milestone capture only for a run with an owner-applied decision, not a model review. Both reuse the existing 15-second own-window native consent, capture indicator, MP4 encoder and immutable media registry. Inspect the saved artifact in Telegram Bots → Evidence and deliberately choose Send to Telegram. No status change automatically records, uploads or changes a profile image. This new button path has not been exercised natively during this correction; the original capture/send path and native tests are preserved.

### Acceptance still pending

The implementation is not marked fully accepted. Computer Use timed out waiting for app-access approval for the newly launched `The Swarm 3D.exe`, so direct inspection, responsiveness/FPS and restart validation of the final native Windows build remain pending that access. Mac mini M4 runtime/FPS testing is also unverified because no Mac execution host is attached. The two target devices still need direct checks at Medium and High quality, with a real task running, reduced motion, minimize/restore, inspector/camera interaction and the native-consented recording path.

All independent implementation, browser evidence, model exports and regression checks above are complete and reviewable. Final device acceptance and publishing/merging remain separate owner steps.
