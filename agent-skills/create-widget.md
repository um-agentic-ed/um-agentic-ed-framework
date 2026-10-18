# Create or update widget

## Usage

Invoke this skill after an Editor has added (or edited) a `widget` content block in
the app's Editor mode and **saved** the Slide — this skill only authors the
`<widget>.js` file on disk; it never touches the running app.

Follow the slash command with the target, in either form:
- Shorthand: `/build-app create-widget <subject>/<category>/<section>/<slide> [widget-name]`.
  Omit `widget-name` if the Slide has exactly one widget block.
- Plain language: describe the Slide and/or widget. Resolve this by searching
  `content-index.js` and the relevant `slide.js` file rather than guessing.

If no target was given and none can be inferred from the active editor file,
current selection, or chat context, ask the Editor which Slide/widget to
target before doing anything else.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the [Framework AGENTS.md](../AGENTS.md) in full before proceeding — together they are the
authoritative spec for this app, including the "Widget file generation"
section (widget host contract, approved libraries, staleness tracking) that
governs this task. Also read the target Section's own
`src/content/<subject>/<category>/<section>/AGENTS.md`, if one exists, for
Section-specific content guidance.

1. **Locate the widget block.** Open the target
   `src/content/<subject>/<category>/<section>/<slide>/slide.js` and find the
   `content.blocks` entry with `type: "widget"` matching the requested
   `widget-name` (or the only one, if none was given). If no matching block
   exists, or the match is ambiguous, stop and tell the Editor to add/rename
   the widget block and Save the Slide in the app first — do not author a
   widget block yourself directly in `slide.js`.
2. **Check whether regeneration is actually needed.** The block's `name` is
   the `<widget-name>.js` filename and its
   `window.umedAppWidgets['<subject>/<category>/<section>/<slide>/<widget-name>']`
   registry key. If that file already exists:
   - Read its first line. If it is a
     `// Generated from widget block instructions last updated: <timestamp>`
     comment whose timestamp equals the block's current
     `instructionsUpdatedAt`, the saved `instructions` have not changed since
     this file was last generated. Confirm with the Editor that they still
     want it regenerated before continuing.
   - Otherwise, proceed — the file is missing, stale, or was never stamped.
3. **Author `<widget-name>.js`** per the widget host contract in AGENTS.md:
   assign `window.umedAppWidgets['<subject>/<category>/<section>/<slide>/<widget-name>']
   = { init(container) { ...; return destroy; } }`. Use only the globally
   available **Chart.js** (plots/charts), **Tabulator** (tables), or
   **Sortable.js** (drag-and-drop ordering) — see
   [widget-host.js](../components/widget-host.js) for
   how the app loads and calls this file; do not modify that file. Follow the
   block's `instructions` field for what to build, and AGENTS.md's content
   sourcing and security rules for any data or claims embedded in the widget.
4. **Stamp the file.** Make the first line of `<widget-name>.js`:
   `// Generated from widget block instructions last updated: <instructionsUpdatedAt>`
   using the exact value currently in the widget block (or, if the block has
   no `instructionsUpdatedAt` yet, ask the Editor to make a trivial edit and
   Save in the app so one is set, since that field is app-managed and not
   something you should invent or edit directly).
5. **Honor declared data-file dependencies.** If the widget instructions use
   one or more `dataFile` blocks, verify that each named dependency exists in
   App content and use its exact kebab-case `name`. Follow the Framework
   `AGENTS.md` DataFile registry and cleanup contract; do not invent a file
   name, parser library, or persistence behavior.
6. **Leave everything else alone.** Do not edit `content-index.js` (widgets
   are not indexed there) or the block's `name`/`instructions`/
   `instructionsUpdatedAt` fields in `slide.js` — those are owned by the
   Editor via the app.
7. **Validate the generated file.** Check its JavaScript syntax; confirm the
   first-line stamp exactly matches the block's `instructionsUpdatedAt`; confirm
   its filename and registry key exactly match the block name and Slide path;
   and verify that `init(container)` returns cleanup that destroys library
   instances, removes listeners/subscriptions, and releases other resources.
   Confirm that no file outside the single target widget file changed.
8. **Report.** State which file you created/updated and give a one-line summary
   of what it renders, so the Editor can reload the Slide in the app to check it.

