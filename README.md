# Persona Expression Sheet

A [Lumiverse](https://lumiverse.chat) Spindle extension that gives your **persona** the
same kind of expression-sheet feature characters get from sprite packs — except
this one is just for you. Upload your own art for each mood, and a small
floating widget swaps to the right image as you chat.

## Features

- **Persona Expressions tab** (drawer sidebar) — a grid of expression slots
  (neutral, happy, sad, angry, surprised, embarrassed, smug, sleepy, confused,
  scared, plus any custom labels you add). Click an empty slot to upload an
  image; click a filled slot to make it the active expression.
- **Floating widget** — a small draggable, edge-snapping image overlay that
  always shows your persona's current expression. Click it to jump back to
  the Expressions tab.
- **Auto-reactivity** — when you send a message as your persona, the
  extension scans it for simple mood keywords ("laughs", "blushes", "furious",
  etc.) and automatically switches to the matching uploaded expression, if
  you have one for that mood.
- **Quick-set button** — an "Set Persona Expression" action in the chat
  input bar's Extras popover lets you manually force an expression at any
  time, no tab-switching required.
- Per-persona storage — each persona keeps its own independent set of
  expressions, automatically following you when you switch personas.

## Project structure

```
persona-expression-sheet/
├── spindle.json        # manifest
├── package.json
├── tsconfig.json
├── src/
│   ├── backend.ts      # storage, persona tracking, mood detection, image upload
│   └── frontend.ts      # drawer tab UI, floating widget, input bar action
├── dist/
│   ├── backend.js       # pre-built — committed, not auto-generated
│   └── frontend.js
└── README.md
```

`dist/backend.js` and `dist/frontend.js` are pre-built and committed —
the same way the working `LumiBooks` extension ships itself. Don't rely on
Lumiverse to build `src/` for you; ship the compiled output. If you edit
`src/backend.ts` or `src/frontend.ts`, rebuild before pushing:

```bash
# with bun:
bun add -d lumiverse-spindle-types
bun run build

# without bun, plain tsc works too:
npm install -g typescript
npm run build:tsc
```

Also note `package.json` has `"type": "module"` set. The frontend module is
shipped as an ES module (`export function setup(ctx) {...}`); without that
flag, whatever loads `dist/frontend.js` can choke on the `export` keyword
and silently mount nothing — which is almost certainly why the tab didn't
show up the first time.

## Installing

1. Push this folder to a GitHub repo (update the `github` / `homepage` fields
   in `spindle.json` to point at it).
2. In Lumiverse, open the **Extensions** panel (puzzle-piece icon) → **Install**.
3. Paste your repo URL and confirm.
4. Open the extension's permission settings and grant:
   - **Personas** — required to read your active persona.
   - **Images** — required to store the expression art you upload.
   - **UI Panels** — optional, only needed for the floating widget. Everything
     else (the drawer tab, uploads, auto-detection, quick-set button) works
     without it.
5. Open the new **Persona Expressions** tab (puzzle-piece sidebar icon →
   "Faces") and start uploading art for your active persona.

## How the pieces fit together

- **Storage**: each persona's expression set (`activeLabel`, custom `labels`,
  and `slots` mapping label → uploaded image) lives in
  `spindle.storage` as `expressions.json`, scoped to this extension.
- **Images**: uploaded art is stored through Lumiverse's own Images API
  (`spindle.images.upload`), the same system character avatars use, so it
  gets thumbnailing and authenticated URLs for free — no extra image hosting
  needed.
- **Mood detection**: `src/backend.ts` exports a small `MOOD_KEYWORDS` map.
  It only ever switches to a label you've actually uploaded an image for, so
  an empty slot never gets selected. Tune the keyword lists (or add new
  labels to `DEFAULT_LABELS`) to match your own roleplay style.
- **Live updates**: the backend pushes `state` and `active_changed` messages
  to the frontend over `spindle.sendToFrontend` / `ctx.onBackendMessage`,
  which is what keeps the floating widget and the grid in sync without
  polling.

## Notes & limitations

- This was written assuming a **user-scoped** install (the common case for a
  personal, self-hosted Lumiverse instance). If you install it
  **operator-scoped** for a multi-user server, swap the `spindle.storage.*`
  calls in `src/backend.ts` for the equivalent `spindle.userStorage.*` calls
  so each user's expressions stay private.
- Mood detection is intentionally a simple keyword scan, not an LLM call —
  it's instant and free, but it's a heuristic, not magic. If it picks the
  wrong mood, just tap the slot you want (or use the input-bar quick-set
  button) to override it.
- I haven't been able to run this against a live Lumiverse instance, so
  treat it as a strong, docs-grounded starting point rather than
  guaranteed-perfect code — if the install step throws a manifest or
  permission error, check it against the latest
  [Manifest](https://docs.lumiverse.chat/getting-started/manifest/) and
  [Permissions](https://docs.lumiverse.chat/getting-started/permissions/)
  docs, since those are the two things most likely to drift between
  Lumiverse versions.

## Ideas for extending this further

- Drag-to-reorder expression slots.
- Export/import a full expression sheet as a shareable JSON bundle (mirrors
  the preset import/export pattern in Lumiverse-SimTracker).
- A "random" button that cycles to a random uploaded expression for fun.
- Hooking `GENERATION_ENDED` instead of/alongside `MESSAGE_SENT` if you'd
  rather react to what the *character* just said about your persona, not
  just your own outgoing text.

