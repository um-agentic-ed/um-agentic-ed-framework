# Develop system

## Usage

`um-agentic-ed` developers invoke `/develop-system` when their intent is to
make changes to the structure, logic, and codebase that defines the system, in 
contrast to updating the educational content of a specific App. Agents must be 
given explicit authorization to change system behavior; by invoking this Skill,
a developer has indicated that an Agent is authorized to make system-level 
changes as directed by the developers specific further instructions.

## Instructions for the agent

### Instruction scope

- Read and follow both the Parent `AGENTS.md` and the Framework `AGENTS.md`
  before making changes. The Framework
  instructions remain the authoritative contract for App structure and content;
  this Skill adds the implementation constraints needed to change that contract
  or the shared system that implements it.
- Treat invocation of this Skill as authorization for system-level changes only
  within the developer's stated brief. It does not authorize unrelated changes,
  compatibility breaks, or changes to App educational content.
- Preserve compatibility with existing Apps unless the developer explicitly
  authorizes a breaking change after its impact is identified.
- Read the relevant Framework code before editing it. Use the codebase to learn
  implementation details, but preserve the developer intent and invariants stated
  here and in the Framework `AGENTS.md`.
- Keep shared Framework code modular, generic, and free of behavior that is
  specific to one App, Slide, or widget.
- Update the Framework `AGENTS.md` when a system change alters the public contract
  App Editors or content-generating Agents must follow. Keep implementation-only
  instructions in this file.

### System change scope

System-level changes include:

- Parent system structure files such as `.github/skills`, `.gitignore`,
  `.gitmodules`, the system-governed portions of the Parent `AGENTS.md`, and the
  HTML entrypoint.
- Framework structure and execution code under
  `src/um-agentic-ed-framework`.
- Changes to the shared schemas, file tree, routing, editing, indexing, security,
  or other behavior that defines the contract between Apps and the Framework.

App metadata and branding files, App-specific portions of the Parent
`AGENTS.md`, and educational content under `src/content` are not system changes
unless the brief also changes the shared contract that governs them.

### Runtime and compatibility requirements

- Learner and Presenter Modes must work in common browsers including Chrome,
  Edge, and Safari. Editor Mode requires Chrome or another browser supporting
  `showDirectoryPicker()`.
- The App is primarily static, works from a local `file:///` HTML entrypoint,
  and requires no back-end server logic. Learner and Presenter Modes may also be
  served by a static web server.
- Inputs and widgets are stateless between sessions except where the public
  contract explicitly stores values in IndexedDB or saved files.
- Use HTML, CSS, and JavaScript and provide page content as static files.
- New third-party libraries require developer approval. Prefer pinned CDN assets.
  The approved shared libraries are markdown-it, Chart.js, Tabulator,
  Sortable.js, and Fabric.js for the purposes defined in the Framework
  `AGENTS.md`. Arbitrary learner-facing text must not be rendered as HTML outside
  the approved markdown-it path, which disables raw HTML and secures external
  links.

### Framework loading and component boundaries

- Preserve the Framework's top-level organization:
  - `app/bootstrap.js` owns the app shell and loads styles, dependencies, Parent
    configuration, the content index, and the Learner runtime.
  - `app/main.js` contains routing, rendering, and global application state.
  - `components/` contains shared UI components and services.
  - `editor/` contains Editor Mode support.
  - `styles/framework.css` contains shared Framework styles in numbered sections.
- The Parent HTML entrypoint is a stable launcher that loads only
  `app/bootstrap.js`. Keep the app shell and all dependency ordering in the
  Framework bootstrap so a submodule update cannot require replicated HTML edits.
- The bootstrap loads `framework.css` before exposing the UI, applies `app.css`
  after Framework styles, and loads `app/schema-contract.js`, `app.js`, and
  `content-index.js` before `main.js`. `app/schema-contract.js` is the single
  authority for accepted index, Slide, learner-notes, and agent-skill-manifest
  schema versions and their lightweight structural validators.
  Features used only occasionally are loaded on first use:
  - Activating Editor Mode loads `editor/file-access.js` and `editor/editor.js`.
  - Entering Presenter Mode or opening the Learner sketchpad loads Fabric.js and
    `components/presenter-whiteboard.js`.
  - New code used only in one of these modes must follow the same lazy-loading
    approach rather than being added to the initial HTML load.
- `components/widget-host.js` is the only Framework code that loads widget files
  and invokes their `init` and `destroy` methods. It must contain no per-widget
  logic.
- `components/data-files.js` is the only Framework code that stores or looks up
  Learner-uploaded data files. Its registry is session-lifetime, in-memory, and
  never writes uploaded data to disk.
- Content files must render through shared, generic code rather than per-Slide
  application logic, remain efficient to load, and work from local files without
  CORS failures. Their serialization need not be optimized for direct human
  editing because human Editors work through the running App. Load each Slide's
  Javascript assignment through a `<script>` element when its route is requested.
- Load `content-index.js` once before individual Slide content. It assigns
  `window.umedAppContentIndex`; load individual Slide files only on demand. The
  index drives sidebar rendering; a route is valid only when it resolves to an
  index entry; partial routes select the lowest-`order` applicable entry; and
  search suggestions prefix-match Slide keywords before deriving their Category
  and Section links.
- Load approved widget libraries once through pinned bootstrap dependencies so
  they are available globally to widget files.

### Editor Mode implementation

- Editor Mode is activated by Ctrl-clicking the App title (Cmd-click on macOS),
  leaves the current route unchanged, and provides list actions and an editing
  pane with immediate in-browser updates where possible.
- Permanent saves require the Editor to select the Parent root through the File
  System Access API. Validate that the folder contains `src/content` and that
  `app.js` declares the current `appUuid`. Apart from the project-lock exception
  defined below, Editor Mode writes only within `src/content`.
- Honor Editor Mode only on `file:///` URLs. It is not a security boundary;
  anyone may edit their own local clone.
- All raw File System Access operations must go through
  `editor/file-access.js`. Do not bypass its retry handling for transient
  cloud-synced-folder `NotFoundError` and stale-interface failures.
- Operations that lengthen paths, including section splitting or moving, must use
  the shared path-budget check. The check empirically accounts for the selected
  Parent's location and Windows path limits before any real copy is attempted.
- `app/main.js`'s `nameFromTitle` and `uniqueId` implement the title-to-identifier
  rule in the Framework `AGENTS.md`. Keep Editor-generated identifiers consistent
  with that public App-content contract.
- A name typed deliberately by an Editor, such as in a Slide or section-break
  dialog, is slugified without removing common words. Enforce the 20-character
  limit in the input so the typed name never requires automatic truncation.
- Editor operations that change a Slide must keep its content file and
  `content-index.js` synchronized as one logical operation.
- When serializing a Slide, reconcile its content-object `id` from the final
  path key so the file, folder, registration key, and index entry cannot retain
  different Slide identifiers.
- A section-break operation creates the new `section.js`, moves every Slide at or
  after the selected insertion point while preserving Level and order, rewrites
  moved content keys, saves the index, and only then removes original folders.
  Require unsaved Slide changes to be saved or discarded first.

### Content editor implementation

- For `image`, `link`, `widget`, and `dataFile` blocks, show optional `markdown`
  as the first Editor input and keep it attached when its Block is reordered.
- A `trustedSources` block on a Category or Section landing Slide manages that
  landing scope's `_trusted_sources` files through File System Access controls
  that add, overwrite, and remove files. Each entry also carries a public URL
  and optional link label; Learners are linked only to that URL, never to the
  local context file. Editors may upload or drop a file, or add a URL-only source
  for the `generate-content` skill to resolve before content generation, and may
  reorder entries by dragging their handles.
- A Question block's choices use a nested Sortable list inside the Slide's outer
  sortable Block list.
- If a widget block has no matching generated `<widget>.js`, show a placeholder
  rather than an error. Editing the block's `name` or `instructions` changes only
  the in-memory Slide and never generates or live-previews the widget file.
- Render a `dataFile` block's prompt with a small inline native-file-picker
  button, using the same icon as the Editor image-upload control and restricting
  selection to the block's `extensions`.
- If a generated Subject id would equal reserved `assets` or `app-overview`, append
  a numeric suffix.

### Editor project-lock implementation

The Agent-side lock requirements remain in the Framework `AGENTS.md` because
they apply to every project mutation. Editor Mode additionally follows this
browser-specific protocol for entering and exiting Editor Mode:
- To enter Editor Mode, first obtain File System Access API permission to read 
  and write the Parent root folder. If the user denies permission or the selected
  folder fails validation checks, refuse to enter Editor Mode with an informative 
  message. File system access permissions persist for the browser session and are 
  not re-requested on every Editor Mode entry unless access is lost.
- Next obtain an exclusive Web Lock keyed by `appUuid` for the duration of every
  active Editor Mode session. If Web Locks or equivalent cross-tab exclusion is 
  unavailable, or the lock cannot be obtained, refuse to enter Editor Mode.
- Next attempt to read any existing `editorName` and `sessionToken` values from 
  sessionStorage in the `appUuid` namespace for use in validating the `APP_LOCK.js` 
  file. Keys written to sessionStorage below use the same namespace. All matches
  to these keys must be exact, including case, after trimming whitespace. 
- Next prompt the user for their `editorName` via a text input if it was not
  recovered from sessionStorage, or if the recovered name is not in 
  `allowedEditorNames`. If the user cancels the prompt or the entered name 
  is not in `allowedEditorNames`, refuse to enter Editor Mode and explain that 
  they should ask for help from a project administrator if they need to edit app 
  content. A valid `editorName` is stored in sessionStorage.
- Next check for `APP_LOCK.js`. 
  - If `APP_LOCK.js` exists, read the file. If its `mode` is not "editor" or the 
    `owner` does not match the current `editorName`, or the lock is malformed,
    refuse to enter Editor Mode with an informative message and release the Web Lock. 
    If the lock `token` matches the `sessionToken` recovered from sessionStorage, 
    the lock is validated and Editor Mode may proceed unimpeded. Otherwise, prompt 
    the user to ask if they would like to continue their previous session and, if 
    approved, update the `APP_LOCK.js` `timestamp` and `token`, copy the new token 
    to `sessionToken` in sessionStorage, then reread `APP_LOCK.js` to validate the 
    updated values. If refused by the user, silently release the Web Lock and abort 
    the entry into Editor Mode. 
  - If APP_LOCK.js does not exist, create it with the current editorName and a new 
    token, store the token in sessionStorage, then reread APP_LOCK.js and validate 
    its mode, owner, and token before entering Editor Mode.
  - Never mutate another owner's lock or automatically treat a pre-existing lock as stale. 
- Acquire all permissions, identities and locks before entering Editor Mode. Thus, 
  only one Editor Mode session may be active at a time, and no Agent may mutate 
  the project while Editor Mode is active or vice versa. 
- Creating, validating, and removing `APP_LOCK.js` are the sole exceptions to
  Editor Mode's `src/content` write boundary. Disclose this Parent-root lock-file
  access in the folder-access UI.
- The File System Access API cannot atomically create-if-absent, so this is
  cooperative exclusion with a small unavoidable race against an Agent process
  or another Editor. This risk is acceptable because app locks are held and kept 
  for long-lived Editor and Agent sessions with limited multi-user concurrency. 
- Retain all locks whenever and for as long as Editor Mode is active. The locks 
  must be released only when the user switches to Learner Mode. Entering Presenter 
  Mode from Editor Mode does not release the locks. Leaving Editor Mode to Learner
  Mode must:
    - Finish any pending mutations.
    - Reread `APP_LOCK.js` and validate its `mode`, `owner`, and `token`.
    - If validation succeeds, remove `APP_LOCK.js`, confirm its removal, and then
      clear the `sessionToken` from sessionStorage and memory.
    - If validation or removal fails, leave the lock untouched, retain the
      `sessionToken`, and show an informative message so the session can be recovered.
    - Release the Web Lock as the final step.
    - Retain the `editorName` in sessionStorage.
- When an Editor closes or reloads the browser tab or window from Editor Mode, the 
  Web Lock is released automatically, but APP_LOCK.js remains. On returning, the 
  Editor must reacquire the Web Lock. A lock with matching mode, owner, and 
  sessionToken continues the same session without replacement. If the token does 
  not match but mode and owner permit confirmed recovery, replace both the lock 
  token and timestamp as described above.
- Learner Mode, IndexedDB note autosaves, and browser downloads that do not alter
  the project tree do not acquire `APP_LOCK.js`; imports or exports that write into
  the project tree do.

### Shared interface behavior

- Page layout and Framework styles are mature and should change only when the
  brief requires it. Preserve the hierarchy-to-navigation mapping and use the
  existing implementation as the detailed guide.
- When Subjects are enabled, show their selector in the header to the right of
  the App title. In the sidebar, show Categories with their nested Sections and
  keep inactive Categories collapsed so Section visibility is exclusive.
- Preserve functioning browser history and Back behavior, partial-route landing
  resolution, invalid-route handling, and forward/backward skipping of empty
  Slides outside Editor Mode.
- Search operates on the normalized keywords stored in the content index. Query
  terms use the same whitespace, hyphen, punctuation, minimum-length, and
  low-value-word rules as indexed keywords; multiple terms are intersected and
  matching is case-insensitive from the start of a keyword. Debounce search input.
- Search results form a Subject/Category/Section/Slide tree. Collapse Slide
  results when a Section has more than ten matches, collapse Section results
  when a Category more than ten matching Sections, and collapse Category
  results when a Subject more than ten matching Categories. Apply those
  decisions independently within each branch. Keep each result label to one line
  with ellipsis overflow.
- When Subjects are suppressed, retain `app-subject` in URLs but omit Subject
  labels and Subject-only results from the displayed search tree.
- Load `content-index.js` before individual Slide content. It drives navigation,
  route validation, default-route resolution, and search; load individual Slide
  files on demand.

### Learner notes and drawings

- Notes are keyed by immutable App and Slide UUIDs, cached in memory, and saved
  automatically to IndexedDB without modifying content files. Each record may
  contain text and a Fabric.js drawing.
- The Learner sketchpad and Presenter whiteboard use the same drawing for a
  Slide. Preserve fixed object coordinates and pixel dimensions as the canvas
  changes size. Fitting a drawing may temporarily scale it for display and must
  disable editing while fitted.
- Keep an opened notepad open while navigating until explicitly closed, with only
  one note-taking view visible at a time.
- Export both modalities to the unencrypted `<appName>.notes.json` format. A
  valid same-App import may atomically replace saved notes or be viewed as
  temporary read-only shared notes without altering the Learner's notes.
- Exported notes files and IndexedDB note records use the current
  `notesSchemaVersion` declared by `app/schema-contract.js`; imports validate the
  notes file contract before performing same-App and drawing-security checks.

