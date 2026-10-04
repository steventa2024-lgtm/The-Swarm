# ZeroPulse Swarm

A desktop app that splits one big task across several AI agents running **different models**, so no single model — or paid API plan — has to carry the whole job.

You drop in a master prompt. A **planner** reads it once and gives every agent a short brief for its own slice. **Workers** build their parts in parallel, a **reviewer** checks the result, and you watch it happen on a live graph, then **preview** what was built and **apply** it to your project.

> **Status: early / experimental.** The UI, the live engine (verified with local Ollama models), key storage, preview and file-apply all work. The OpenAI and Anthropic adapters are written but **not yet tested with real keys**. See [What is and isn't verified](#what-is-and-isnt-verified) and the [test guide](docs/TESTING.md).

Stack: Tauri 2 · Rust · React 19 · TypeScript · Tailwind CSS 4 · Framer Motion · Zustand · SQLite.

---

## Why it exists

Big prompts burn tokens. Sending the whole thing to one expensive model is slow and costly; sending it to many agents naively multiplies the cost. ZeroPulse is built around three ideas:

1. **Read once, brief everyone.** Only the planner reads the full master prompt. Each worker receives a self-contained brief with the requirements that concern it, plus a shared contract (file names, interfaces) so parallel work fits together. Roles with nothing to do are skipped and cost nothing.
2. **Different models for different strengths.** *Agents → Auto-assign* profiles every available model (reasoning, coding, writing, speed, price) and gives each role the best fit, spreading the team across distinct models.
3. **Spend paid tokens only where they're few.** On the default *Token saver* policy, paid models are reserved for planning and review (small outputs). Free local models (Ollama, llama.cpp) or cheap hosted models do the high-volume writing.

## What you get

| Screen | What it does |
| --- | --- |
| **Swarm** | Task box (agent count, run mode), live orchestration graph, worker cards, activity feed, file changes, token / cost / provider metrics. Views: **Graph**, **Timeline**, **Preview**. |
| **Preview** | Renders what the agents built, updating as each finishes. Static HTML/CSS/JS and React/TSX. Desktop / tablet / phone widths, error banner, and a Code tab. |
| **Review & apply** | Compare every proposed file against your real files as a diff, resolve files several agents wrote, then write the ones you pick into your project folder. |
| **Verify & fix** | After applying, run the project's own tests / build / lint (or a JS syntax check) and see the real output. If one fails, **Ask the team to fix it** prepares a fix prompt from the failure. |
| **Agents** | Auto-assign models by strength, per-agent model, editable **skill** (standing instructions), capabilities, enable/disable. |
| **Integrations** | Test & connect providers (Ollama, llama.cpp, OpenAI-compatible, OpenRouter, Anthropic); store API keys securely. |
| **Projects / Knowledge / Templates / Settings / Support** | Working folders per project, project memory notes, reusable task presets, budgets and preferences, diagnostics. |

## Run it

The desktop app is the real thing. API keys, project-folder access and previews **only work in the desktop app**, not in the browser dev server.

**Prerequisites (Windows):** Node 20+, [Rust](https://rustup.rs), MSVC build tools, WebView2 (included in Windows 11). For live runs with local models, install [Ollama](https://ollama.com) and pull a model.

```bash
npm install
npm run tauri build -- --no-bundle   # fast: just the exe -> src-tauri/target/release/zeropulse-swarm.exe
npm run tauri build                  # also builds the .msi and NSIS installers under bundle/
npm run tauri dev                    # development, with hot reload
npm run dev                          # UI only, in a browser (no keys, folders or React previews)
npm test                             # unit tests
```

## How a run works

```
Master prompt
   │
   ▼
Planner (strong model, reads everything once)
   │   writes: shared contract + per-agent brief, acceptance criteria, owned files
   │   may skip roles that have nothing to do
   ▼
Workers run in parallel  ── each gets: its skill + contract + its brief (not the full prompt)
 Frontend · Backend · QA · Docs · Researcher    (different models, each owns its files)
   │
   ▼
Reviewer (compact digest, checks every agent's acceptance criteria)
   │
   ▼
Final output  →  Preview tab  →  Review & apply to your project folder
   │
   ▼
Verify (run your tests/build)  →  failed?  →  "Ask the team to fix it"  →  back to the Planner
```

Worker output is **proposed file contents**. Nothing touches your disk until you review and apply it.

## Architecture

```
src/
  types/             Domain types: Task, Run, Worker, Provider, AgentDefinition, FileChange, Metrics…
  data/
    seed.ts          Default providers, agents, projects, templates, memory
    skills.ts        Default skill (standing instructions) for each agent role
  engine/
    driver.ts        OrchestratorDriver interface — the seam between UI and orchestration
    liveDriver.ts    Real driver: plan → parallel workers → review, over provider adapters
    simulator.ts     Scripted demo driver (the default on first launch)
    strengths.ts     Model profiling + auto-assign (token-saver / balanced / quality)
    routing.ts       Per-run-mode model routing
    notes.ts         Sends only the project notes that relate to the prompt
    blueprints.ts    Placeholder plans used by the simulator
  providers/         OpenAI-compatible + Anthropic adapters, SSE parser, transport, connection test
  preview/build.ts   Turns proposed files into a runnable preview (HTML, or TSX via sucrase + import map)
  lib/               diff, checks runner + secrets + file-access bridges, formatting helpers
  store/             Zustand: persisted workspace data, live run state
  persistence/       SQLite (desktop) or localStorage (browser)
  components/ pages/ UI (shadcn-style primitives, graph, rails, dialogs, 8 pages)
  __tests__/         Vitest suites
src-tauri/
  src/provider.rs    HTTP bridge to model providers (attaches keys, streams responses)
  src/secrets.rs     API keys in Windows Credential Manager (write / check / delete, never read back)
  src/fs.rs          Project file access confined to folders the user approved
  src/preview.rs     Loopback preview server, sandbox-friendly CSP
  src/checks.rs      Runs a project's tests/build/lint from a fixed menu, with timeout + cancel
  migrations/        SQLite schema
docs/TESTING.md     What to test, in what order, and what "good" looks like
.github/workflows/  CI: typecheck, unit tests, web build (Linux) and Rust tests (Windows)
```

## Cost controls

- **Token budget (Settings).** A daily limit on *paid* tokens over a rolling 24 hours. Local models are free and never counted, and neither are simulated runs or the sample history.
  - **Strict:** a paid run won't start once the limit is used up, and a live run that reaches it is stopped. An all-local run is never blocked.
  - **Balanced** (default): warns at 80% and 100% but never interrupts a run.
  - **Off:** no limit.
- **Rate limits and overload.** Hosted APIs return HTTP 429 / 5xx when several agents call them at once. A worker retries up to 3 times with backoff (honouring a "try again in…" hint), shown in the activity feed, and only if nothing had streamed yet. Auth errors such as a bad key are not retried. Stop cancels a wait immediately.
- **Skipped roles and slim briefs** (see above) are the main saving; the budget is the safety net.

## Security model

- **API keys** live in Windows Credential Manager. The UI can save, check and delete a key but can never read one back; only the Rust bridge reads it, to attach a header. Key names must end in `KEY` or `TOKEN`.
- **File access** is limited to project folders you pick in the native dialog. Approval is enforced in Rust and persisted; paths with `..`, absolute paths, symlink escapes and `.git` are rejected.
- **Previews** run in a sandboxed iframe served from a loopback port on its own origin, with a CSP that blocks the page from making its own network requests. Generated code cannot reach the app, its storage or its IPC.
- **Live runs send your prompt (and any related project notes) to the providers you verified.** Use *Local Only* mode, or only connect local providers, to keep everything on your machine.
- **Running checks** executes your project's own scripts, so it is a deliberate, per-click action. The UI shows the exact script text first. The webview can only choose from a fixed menu (`npm run test|typecheck|lint|build|check`, `cargo check|test`, `pytest`, a JS syntax check) in an approved folder — it can never send a command line. Every run has a 3-minute timeout and a Stop button that kills the whole process tree.
- Ollama "cloud" models are hidden from local providers because they leave the machine.

## What is and isn't verified

**Verified in the real desktop app:** live runs against Ollama (plan, parallel build, review), Pause / Resume / Stop, auto-assign, token-saving skip of idle roles, key storage and bridge, preview of static pages and React pages, the confined file read/apply flow, conflict handling, the release build and Desktop launch. 117 unit tests and 7 Rust tests pass.

**Not verified yet:**
- **OpenAI, OpenRouter and Anthropic adapters** with real keys. Request shape, auth headers, streaming, usage and error handling are covered by unit tests against the documented protocols, but no real request has been made.
- The native **folder-picker dialog** (its approval logic is tested; the dialog itself is not automated).
- The **MSI / NSIS installers** (built, never installed).
- A second live run after the latest "don't write other agents' files" prompt change.

**Known limitations:**
- Windows only for stored keys right now (the credential-store feature is enabled for Windows only).
- Local models are slow to load and their output quality varies; the reviewer is still an LLM opinion — use **Verify** for real results. Dependencies are never installed for you (run `npm install` yourself first).
- React previews load React from esm.sh, so they need internet.
- Model strength profiles are heuristics from model names and prices, not benchmarks.
- The fix loop is manual: a failing check prepares a fix prompt, but you press Run. Nothing re-runs the team automatically.

## Contributing / extending

- Add a provider: implement `ProviderAdapter` in `src/providers/` and register it in `adapterFor`.
- Change how work is split: edit the planner prompt in `src/engine/liveDriver.ts` and the default skills in `src/data/skills.ts`.
- Swap the orchestrator: implement `OrchestratorDriver` and select it in `src/store/swarm.ts`.
- Theme: colour tokens are in `@theme` in `src/index.css`.

> A `postcss.config.js` in a *parent* folder can break Vite builds; `vite.config.ts` pins an inline PostCSS config to avoid that.
