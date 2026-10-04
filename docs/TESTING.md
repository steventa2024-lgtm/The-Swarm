# Test guide

What to test, in a sensible order, and what "good" looks like. Each section lists the steps, the expected result, and what to send back if it doesn't match.

**Legend:** ✅ already verified by the author · ⚠️ **not yet verified — please test this one** · 🧪 automated

---

## 0. Setup (5 min)

1. Build or install the desktop app (see the README): `npm run tauri build -- --no-bundle`, then open `src-tauri/target/release/zeropulse-swarm.exe`.
   - Test the **desktop app**, not `npm run dev`. Keys, folders and React previews don't work in the browser.
2. For live runs with local models: install Ollama, run `ollama serve`, and pull at least one coder model (e.g. `ollama pull qwen2.5-coder:7b`). Several different models make the auto-assign test more interesting.
3. Automated checks (optional but quick):
   ```bash
   npm test                    # 80 unit tests (incl. the live driver: Stop, Pause, token-saving)
   cd src-tauri && cargo test  # 7 Rust tests (path safety, check detection)
   ```

## 1. Smoke test (2 min) ✅

| Step | Expected |
| --- | --- |
| Launch the app | Window opens with a dark-blue UI; a demo run is already in progress on the Swarm page (a scripted simulation) |
| Click each sidebar item | All 8 pages open with no blank screen or error |
| Resize the window narrower than ~1280 px | Sidebar collapses to icons; layout stays usable |
| Close and reopen | Your settings and projects are still there |

## 2. Connect a provider ✅ (Ollama) / ⚠️ (everything else)

**Ollama (local):** Integrations → Ollama → **Test & connect**.
- Expected: badge turns **Verified**, with "N models · NN ms". Any `-cloud` model is reported as hidden.
- If it fails: is `ollama serve` running? Send the red message on the card.

**OpenAI key — ⚠️ the main thing to test:**
1. Integrations → **OpenAI-compatible** → paste your key into the field → **Save**.
   - Expected: "Key saved in Windows Credential Manager". The field clears and never shows the key again.
2. Click **Test & connect**.
   - Expected: **Verified** and a latency. If the card warns "N configured models not found", the seeded model names (`gpt-4.1`, `gpt-4.1-mini`) aren't on your account — pick real ones on the Agents page.
3. Check Windows Credential Manager (Control Panel → Credential Manager → Windows Credentials): there should be an entry for `ZeroPulse Swarm`.
4. **Remove** the key and confirm the card goes back to "No key yet".

Report: the exact error text, and whether the key worked via the field vs. an `OPENAI_API_KEY` environment variable. **Never paste the key itself into an issue.**

Same procedure for Anthropic (`ANTHROPIC_API_KEY`) and OpenRouter (`OPENROUTER_API_KEY`) if you use them.

## 3. Auto-assign models by strength ✅

1. Agents → policy **Token saver** → **Auto-assign**.
2. Expected:
   - A green summary like "Assigned 7 agents across 6 different models; none use a paid model" (with OpenAI verified: exactly **one** paid model, on the Planner).
   - Each agent card shows "Chosen for: …" with the reasoning.
   - Coding roles (Backend, Frontend) get coder models; Docs gets a general/writing model.
3. Switch to **Best quality** and run it again: workers may now get the paid model.
4. Open an agent's **Skill** section, edit it, then **Reset** — it should return to the default.

Sanity check, not a bug report: are the picks *reasonable for your models*? The strength profiles are heuristics from model names, so tell me if a choice looks wrong.

## 4. A live run ✅ (Ollama) / ⚠️ (paid providers)

1. Settings → Orchestrator → **Live**.
2. Swarm page, prompt: `Build a small todo web app. Users can add a task, mark it done, and delete it. Tasks persist in localStorage. Clean dark UI that works on mobile.`
3. Press **Run swarm** and watch.

Expected, in order:
- **Planning**: the Planner reads the prompt. The activity feed says "Plan ready — N of M agents have work". Agents with nothing to do are **skipped** ("no tokens spent").
- **Running**: workers go *Working* in parallel, each on its own model; the feed shows "Writing index.html" etc.
- Expand a worker card: it shows **"Its slice of your prompt"** — its own brief, not your whole prompt.
- **Reviewing → Completed.** The Final output node shows files, +lines, tokens. Cost is $0.00 for local models.
- A "needs attention" verdict is normal with small models; it's the reviewer's opinion.

Check the **Models** tab (right rail) to see which model each agent used, and **Total tokens** — the point is that this stays low relative to sending everything to one model.

With a **paid** provider verified, also confirm: the cost estimate is non-zero but small, and **only the Planner** used the paid model under Token saver. ⚠️

## 5. Preview ✅

After a run that builds something visual, click **Preview** (a green dot appears on the tab when it's ready).

| Check | Expected |
| --- | --- |
| The page renders (e.g. a todo form) | You see the app, not a blank frame |
| Interact with it | Add / complete / delete works; reload the preview and localStorage data persists |
| Device buttons | Desktop / tablet / phone widths change the frame |
| Reload button | Preview reloads |
| **Code** tab | Lists each file; selecting one shows its code |
| A task with no visual output (e.g. "write a utility function") | Preview says "No visual preview for this output" and offers the Code tab |
| A broken page | A red error banner at the bottom with the error text |

React/TSX previews need internet (React loads from esm.sh). If a preview is blank, open **Code** — and send me the file list and the red banner text, if any.

## 6. Review & apply to a project ✅ (folder dialog ⚠️)

1. Projects → pick a project → **Choose folder** — pick a **throwaway test folder** with a file or two in it. ⚠️ (native dialog)
2. Run a live task that targets a file in that folder (e.g. `Add a leading-edge option to the debounce function in src/debounce.ts and add a test`).
3. When it finishes, click **Review & apply** (final output dialog, or the Changes tab).
4. Expected:
   - Each proposed file shows **New** or **Modified** with a diff.
   - If two agents wrote the same file, it's marked **Pick one**, left unselected, and shows a chooser; **Apply** stays disabled for it until you choose a version.
   - Nothing is written until you press **Apply N files**; then the result lists Created / Updated.
5. Verify on disk that only the files you ticked changed.

Safety checks worth trying: you can't apply into a folder you haven't approved; files outside the folder are never written.

## 6b. Verify & fix ✅ (try it on your own project)

After **Apply** succeeds, a **Verify the result** panel appears.

| Check | Expected |
| --- | --- |
| Buttons offered | Only what your project defines: `npm run test / typecheck / lint / build / check`, `cargo check / test`, `pytest`, and a JavaScript syntax check. Hover a button to see the exact command it runs. A script like `deploy` or `start` is never offered. |
| Run one | Live output streams in; the button turns green (passed) or red (failed) with the time taken |
| **Stop** during a long check | Ends within a few seconds and kills the whole process tree (no stray `node` left in Task Manager) |
| A failing check | A red banner offers **Ask the team to fix it**; clicking it closes the dialog and puts a prepared prompt in the task box. Review it, then press Run |
| After running | The check appears in the run's Final output list as pass / fail |
| No `node_modules` | A hint says to run `npm install` yourself first; the app never installs dependencies |

This **runs your project's own scripts**, so only do it in projects you trust. Each run has a 3-minute timeout.

## 7. Pause / Stop ✅

During a live run:
- **Pause** → status shows *Paused* and the clock freezes; the next stage waits; in-flight model calls finish. **Resume** continues.
- **Stop** → status *Stopped* within about a second; the run ends and appears in history; no worker stays "working" and no more model calls start. Stop while *paused* also ends the run (status must not stay "Paused").

Two bugs here were found and fixed by testing (a worker starting after Stop; status stuck on Paused after Stop) and are covered by automated tests. If you still see a run that spends tokens after Stop, please report it.

## 8. Settings, budgets and persistence ✅

- Settings → Token budget: the sidebar usage bar reflects it.
- Reduce motion: pulsing/flowing animations stop.
- Settings → Reset local data: restores defaults (confirm prompt appears first).

## 9. Edge cases worth poking at

- Run with **no provider verified** and Live on → expect a failed run with the message "No verified provider…" rather than a hang.
- Turn Ollama off mid-run → the affected agent shows an error; the run should fail or finish with a clear message, not freeze.
- A very long master prompt (a page or two) → the planner should still produce briefs; check workers aren't each receiving the whole thing.
- Run twice in a row; start a new run while one is live (the old one should be stopped and recorded).

## 10. Reporting a problem

Open an issue with:
1. What you did, what you expected, what happened.
2. Support page → **Copy report** (versions, runtime, providers online — contains no secrets).
3. The red error text from the card, preview banner or activity feed.
4. Which models were involved (Agents page).

**Do not include API keys, or prompts containing private data.**

## Quick checklist

- [ ] App launches; all 8 pages open
- [ ] Ollama verified
- [ ] OpenAI key saved → verified → removed ⚠️
- [ ] Auto-assign gives different models, with reasons
- [ ] Live run completes; idle agents skipped; briefs visible
- [ ] Preview renders and is interactive
- [ ] Review & apply writes only selected files; conflicts require a choice
- [ ] Planner is the only paid model under Token saver ⚠️
- [x] Pause / Resume / Stop behave (verified; re-check on your paid provider ⚠️)
- [ ] Verify runs your project's tests and a failure offers "Ask the team to fix it"
- [ ] Restart keeps your settings
