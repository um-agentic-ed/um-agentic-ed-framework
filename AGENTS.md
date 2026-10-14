# Project overview

`um-agentic-ed` is a system for building education web apps. This repository, 
`um-agentic-ed-framework`, is the Framework Submodule that is reused across 
many Apps. It is wrapped by all App Parents, which themselves are always started
as descendent copies of the `um-agentic-ed-parent` repository.

# Coding agent instruction sources

All prompts that use instructions in this `AGENTS.md` file should have already 
read the `AGENTS.md` file in the Parent, i.e., file `../../AGENTS.md` relative to 
the path to this Framework `AGENTS.md` file. The two files together define the 
instructions for a complete App. 

You will know if the Parent `../../AGENTS.md` file has been read if you have access 
to instructions section `# um-agentic-ed system overview`, which is defined in the 
Parent instructions. If you do not have sufficient instructions you should stop, 
take no action, and inform the user that Agent work on `um-agentic-ed-framework` 
must be coordinated in the context of a repository cloned from `um-agentic-ed-parent`.

This Framework `AGENTS.md` provides context, contracts and invariants that Agents 
must understand and follow when working with an Editor to update app metadata or
content. If you do not have sufficient instructions to accurately interpret the 
system design or codebase as needed to update app metadata or content you should 
stop and notify the user. This file does not itself provide authorization to
make changes to the `um-agentic-ed` system structure or Framework codebase.

## Agent skills

Task-specific Agent skills use a tiered strategy where the Parent app maintains
generic entrypoints `build-app`, `migrate-app`, and `develop-system` in root
folder `.github/skills`, for Editors to edit app content and update it to a new
Framework version and for Developers to edit the Framework. Parent
`.github/skills/<entrypoint>/SKILL.md` files invoke named tasks in
`src/um-agentic-ed-framework/agent-skills/<entrypoint|task-name>.md` that
provide task details consistent with current Framework schema versions and
contracts. Usage syntaxes are `/build-app <task-name> [arguments]`,
`/develop-system <brief>`, and `/migrate-app`. The Framework `agent-skills`
folder must maintain a file `manifest.json` of supported skills that can be used
to support task `/build-app list` to help Editors know what tasks are available.

# App usage modes

The app has three page states:
- *Learner Mode* is the default state where Learners view and interact with 
  educational content, take notes on third-level Slides, and follow up using GPT. 
- *Editor Mode* provides list actions and an editing pane for organizing and
  modifying App content, with immediate live updates in the Editor's browser
  whenever possible and permanent changes saved to the App's Parent repository.
- *Presenter Mode* is a variation of Learner Mode optimized for projected views
  of content with an interactive whiteboard.

# App implementation
- App content, including assets and widgets, must work as static files without
  back-end server logic when users open `<app-target>.html` locally as a
  `file:///` URL. The same files may be served by a static web server in Learner
  and Presenter Modes.
- Inputs and widgets must be stateless between sessions except for values stored
  in files or IndexedDB as explicitly defined below.

# Code standards
- App index and Slide files use the Javascript data structures defined below.
  Widget files may construct browser-native HTML and use CSS and Javascript
  compatible with the static App implementation described above.
- Slides may use reactive Javascript `widget` blocks when interactivity benefits
  learning, such as plots with adjustable parameters.
- Agent-generated App content may use these approved libraries:
  - Chart.js for all plots and charts in `widget` blocks.
  - Tabulator for all interactive data tables in `widget` blocks.
  - Sortable.js for drag-and-drop ordering in `widget` blocks.
- Do not introduce another third-party library into App content without developer
  approval. Loading and pinning shared dependencies is a system change and must
  follow the `develop-system` skill.
- Framework `markdown` fields and Question text are rendered through the shared
  markdown-it implementation described under [Slide content blocks](#slide-content-blocks).
  Do not render arbitrary text directly into HTML from App content or widget code.

# Hierarchical content organization

Educational content is structured in hierarchical levels:
- An *App* is focused on one broad educational context or discipline, e.g., a 
  college course.
- A *Subject* defines one focus area in the context of the App; Subjects are 
  always part of the tree but can be optionally be suppressed to a single 
  default Subject that is hidden in the UI. 
- A *Category* groups major content objectives within a Subject.
- A *Section* groups educational topics within a Category.
- A *Level* orders content by difficulty. 
    - *Foundations* (`foundations`) establish or refresh entry-level knowledge 
      required for consuming the target educational content.
    - *Core Learning* (`core-learning`) is the target educational content for 
      the typical Learner the App is intended for.
    - *Advanced Topics* (`advanced-topics`) content is more challenging or 
      nuanced information once Core Learning is mastered.
- A *Slide* is one digestible unit of educational content that fits well on one
  display screen.
  - Slides progressively build learning across all Levels within a Section.
- A *Block* is one portion of a Slide's contents to support different UI elements.
  - Slide may have zero, one, or multiple instances of any Block type.
- Thus:
  - An App has one or more Subjects (even when Subject usage is suppressed).
  - A Subject has one or more Categories.
  - A Category has one or more Sections.
  - A Section has one to three Levels, as needed.
  - A Level has zero or more Slides.
- A Slide has a title and zero or more Blocks (Slide with no blocks are 
  suppressed in the UI).
- A nested Subject, Category, Section, and Slide define the hierarchical path to 
  one content unit in the App and its associated files. In contrast, Level is a 
  Slide attribute helps organize Slide navigation within a Section, and all 
  Block files and definitions are stored in the parent Slide's folder and 
  description.

# Content identifiers and paths

Every Subject, Category, Section, and Slide has a kebab-case `id` that becomes
a folder name and so a path segment (see File tree below), separate from its
freely long, natural-language `title`. Each `id` is capped at 20 characters so
that deeply nested App paths remain within filesystem path limits. When an Agent
converts a title into an `id`, it must follow this rule so the result is short,
readable, and usually unique without needing the title's full wording:

1. Lowercase the title and split it into words (letters/digits only).
2. Drop common/low-value words (articles, prepositions, conjunctions, and
   similar function words, e.g. "a", "the", "with", "and", "of", "for"),
   unless doing so would leave no words at all, in which case keep the original
   word list.
3. Join remaining whole words with hyphens, adding one word at a time only while
   the result stays at or under 20 characters; stop before adding a word that
   would exceed the limit, even if that leaves only one word.
4. If even the first word alone exceeds 20 characters, hard-truncate just that
   word to 20 characters rather than producing an empty `id`.
5. If an `id` collides with a sibling at the same level, append `-2`, `-3`, etc.,
   shortening the base `id` first if necessary so the suffixed `id` still fits
   in 20 characters.

An Agent may abbreviate an individual long word (e.g. "replication" -> "repl")
when doing so keeps the `id` recognizable, but abbreviation is not required.

# App layout and styles

## Hierarchy and content presentation

Hierarchical levels are reflected in the app:
- When `subjectsEnabled` is true, Subjects are shown on the App landing Slide and
  selected from the header.
- When `subjectsEnabled` is false, the Subject level remains in content storage,
  content keys, and URL paths but is hidden everywhere in the UI. The App has
  exactly one structural Subject whose id and title are both
  `app-subject`; its landing Slide has an empty `content.blocks` array.
- Categories and their nested Sections are shown in the sidebar. In Editor Mode,
  each Category and Section label is followed by the number of content Slides it
  would contribute to Presenter Mode; empty and hidden Slides are excluded, and
  a hierarchy item with no qualifying Slides shows `(0)`.
- Levels are shown in navigation above the Slide content.
- One Slide occupies the content pane at a time, so App content must remain
  organized into digestible Slide units.

Editors and Agents may brand an App in two ways:
- Color selections for the header and sidebar declared in the `app.css` file
  found in the Parent root (see [App identity and branding](#app-identity-and-branding)).
- Images or other content included on Slides.

## App identity and branding

Values that differ between Apps, and that the Framework cannot derive from
content, are declared in two small files in the Parent root. Editors or Agents
set them when creating an App and update mutable values when an Editor changes
the App's identity or branding:
- `app.js` assigns `window.umedAppIdentity`, an object with fields:
  - `appUuid`: immutable canonical UUID v4 of the logical App. It must be
    unique per App and never change; Learner notes are keyed to it in
    IndexedDB and validated against it in exported notes files.
  - `appName`: stable, filesystem-safe kebab-case name. It supplies the
    `<appName>.notes.json` export filename and notes file metadata; `appUuid`,
    not `appName`, is authoritative when validating an imported notes file.
  - `appTitle`: human-readable title, shown in both the app header and the
    browser tab. The HTML entrypoint carries no title of its own.
  - `subjectsEnabled`: boolean indicating whether the Subject level is visible
    and editable in the App UI. Omitted values behave as `true` for backward
    compatibility. When `false`, the single structural Subject follows the
    `app-subject` invariant described above.
  - `discipline`: the subject area Learners study, used with `learnerLevel` as
    context in prompts sent to AI chat assistants.
  - `learnerLevel`: the typical Learner the App targets, as an adjective phrase
    that fits "I am a ___ learner" (e.g., "undergraduate", "post-graduate").
  - `chatbotUrl`: the `https://` (or `http://`) address of the AI chatbot to open
    when a Learner asks about a Slide, since developers prefer different chatbots.
    The prompt, with the Slide text, is copied to the clipboard for pasting there.
    If blank or invalid, prompts are still copied but no chatbot is opened or linked.
  - `allowedEditorNames`: An array of recognized Editor names. Only these names 
    are accepted as valid entries to enable Editor Mode and can be recorded in 
    the `owner` field of  the `APP_LOCK.js` file.
- `app.css` sets CSS custom properties on `:root` that override Framework
  defaults: `--umed-brand-bg`, `--umed-brand-text`, `--umed-brand-hover-bg`,
  `--umed-brand-border` and `--umed-brand-accent`. Use valid CSS colors with
  readable text and hover contrast; omit an override to retain its Framework
  default.

# Routing
- The hierarchical path to the current content is reflected in the visible URL.
- Routes use hashes followed by paths that mirror the hierarchical content tree:
    - Pattern: `file:///<path>/<app-target>.html#/<subject>/<category>/<section>/<slide>`
    - Levels are not part of a path; they are a Slide-level attribute.
- Navigating to a partial path shows its single overview, a.k.a "landing", slide:
  - The Slide for URL `#/<subject>/<category>/<section>` is read from landing slide
    `/src/content/<subject>/<category>/<section>/section.js`.
  - The Slide for URL `#/<subject>/<category>` is read from landing slide
    `/src/content/<subject>/<category>/category.js`.
  - The Slide for URL `#/<subject>` is read from landing slide
    `/src/content/<subject>/subject.js`. In Subject-suppressed Apps this route is
    retained for structural consistency but advances to the first Category-or-
    deeper route, and the Subject landing Slide must be empty.
  - The Slide for a URL with no hashed route, an empty hash `#`, or the root
    hash `#/` is read from `/src/content/app-overview.js`. This landing Slide also
    lists links to all Subjects when Subjects are enabled.
- An invalid route displays the Framework's built-in, non-editable error view.
- In Learner and Presenter Modes, a Slide whose `content.blocks` array is empty is
  skipped rather than rendered. Empty landing and content Slides remain present
  and directly accessible in Editor Mode so Editors can restore their content or
  manage their hierarchy.

# Searching
- Search keywords stored in `content-index.js` are individual, deduplicated,
  lowercase words extracted from content Slide `slide.js` files. They are not
  taken from Subject, Category, or Section landing files (`subject.js`,
  `category.js`, or `section.js`).
- Split Slide text at whitespace and hyphens when extracting candidate keywords.
  Remove punctuation from the outsides of words but not from within a candidate
  keyword; thus, "Height, and Width!" becomes "height" and "width", while
  "A(B)C and XYZ:123" becomes "a(b)c" and "xyz:123".
- Slide text is any word the Learner would see in the content pane, but excludes
  code elements used to generate that visible text or GPT prompts. Thus:
  - Included elements are:
    - Slide title
    - text and markdown lead-ins
    - image alt text and visible caption/label
    - link labels
    - data-file prompts
    - question prompts, choices, and feedback
    - widget block markdown shown to Learners
  - Excluded elements are:
    - retained instructions blocks
    - widget JavaScript source, internal identifiers, and data/code values
    - Subject, Category, and Section landing slides
    - GPT follow-up prompts
- Content Agents must include only keywords of at least three characters and omit
  trivial, low-complexity words such as articles, prepositions, and frequently
  used verbs. Indexed keywords should be specific to the unique content of the
  App.

# File tree

In addition to standard unlisted files like this AGENTS.md, the project file 
tree supports the target organization and implementation.

## Project root

The project root is the root directory of the cloned `um-agentic-ed-parent` 
repository that wraps this instance of the `um-agentic-ed-framework` repository.

```text
/                    Root of the `um-agentic-ed-parent` clone 
  .github/skills/    Agent skills (one folder each, with a SKILL.md) for common repeated tasks
  app.css            App-specific branding colors as CSS custom properties.
  app.js             Top-level App identity declared as window.umedAppIdentity.
  <app-target>.html  Stable App launcher that loads the Framework bootstrap; it may be renamed
  src/               Generated app code and structured educational content
```

## `/src/` file tree

```text
/src/
  content/                  Files that define the App-specific educational content
  um-agentic-ed-framework/  A Submodule clone of this `um-agentic-ed-framework` repository
```

## `/src/content/` file tree

```text
/src/content/
  app-overview.js          Top-level Slide shown on app start
  content-index.js         Master file with metadata for all Subjects, Categories, Sections and Slides
  assets/                  Images and other files used by multiple Slides
    images/                Image asset files
  <subject>/               Folder for a first-level Subject in the header popup
    subject.js             Landing slide shown to introduce a Subject
    <category>/            Folder for a second-level Category in the sidebar navigator
      category.js          Landing slide shown to introduce a Category
      <section>/           Folder for a nested third-level Section in the sidebar navigator
        AGENTS.md          Content generation instructions that apply to all Section Slides 
        section.js         Landing slide shown to introduce a Section
        _trusted_sources/  Folder with files to use as prioritized context for generating Section Slides
        <slide>/           Folder for a fourth-level Slide chosen by content page navigation
          slide.js         Single Slide Javascript file with structured educational content for display
          <asset>.xxx      Slide-specific asset files reside in the same folder as their slide.js
          <widget>.js      Agent-authored plot or table matching the widget host contract (see Widget file generation)
```

Section-level `AGENTS.md` files provide guidance on how to populate educational 
content and build widgets, but the Parent and Framework `AGENTS.md` files remain
the authoritative instructions for app structure.

Section titles and other Section-level metadata not tied to individual Slides 
are stored in `content-index.js`.

## App launch contract

The Parent HTML entrypoint remains the App's canonical URL but contains no App
shell, shared styles, dependency list, or content-loading sequence. It loads only
`src/um-agentic-ed-framework/app/bootstrap.js`. The Framework bootstrap owns those
definitions, loads Parent `app.js`, `app.css`, and `src/content/content-index.js`
relative to the Parent root, and then starts `app/main.js`. Renaming the Parent
entrypoint must not affect these paths or runtime behavior.

The single-file exporter builds from the Framework-owned shell rather than from
the Parent entrypoint, so exports remain independent of the launcher's filename.

# Editing permissions and locks

## Change authorization

- App-specific changes do not require system-developer authorization. These
  include educational content under `src/content`; `app.js`; `app.css`; licenses;
  `README.md`; and the Parent `AGENTS.md` sections `# Project overview` and
  `# Educational content generation guidelines`.
- System changes require the user to invoke the `develop-system` skill. These
  include `.github/skills`, `.gitignore`, `.gitmodules`, the HTML entrypoint,
  system-governed portions of the Parent `AGENTS.md`, and files under
  `src/um-agentic-ed-framework`.
- The skill authorizes only the system changes within the accompanying brief. If
  a proposed change would break compatibility with existing Apps, identify the
  impact and obtain explicit authorization for that break before proceeding.

## Agent and Editor project lock

Use `APP_LOCK.js` in the Parent root to prevent overlapping Agent and Editor Mode
project updates. The lock is cooperative and is not a security boundary.

For every Agent brief, evaluate whether the task is expected to create, write, 
move, rename, or delete any project file. If it might, an Agent must atomically 
acquire `APP_LOCK.js` before doing any work. Creating, validating, and removing 
the lock itself are the only exceptions. Read-only planning and evaluation tasks 
do not require the lock.

`APP_LOCK.js` must be a valid Javascript file as follows so the running app can 
also read it as a script:

```js
window.umedAppLock = {
  // The app lock mode, either `agent` or `editor`. Agents must use `agent`.
  // App Editor Mode must use `editor`.
  mode: "<mode>",

  // The app lock owner. Agents must use `AGENT`. App Editor Mode sets the owner 
  // name from user inputs, which must match an entry in 
  // `window.umedAppIdentity.allowedEditorNames` from `app.js`.
  owner: "<owner>",

  // A newly generated, unguessable owner token.
  token: "<token>",

  // The acquisition time as an ISO 8601 timestamp.
  timestamp: "<timestamp>",

  // A short description of the Agent task. An empty string for app Editor Mode.
  description: "<description>"
};
```

The actual file must contain only `window.umedAppLock = <JSON object>;`, with no 
executable statements beyond that assignment. The comments in this example are 
explanatory and need not appear in the file.

- Agents must acquire the lock with an operating-system-level atomic 
  create-if-absent operation.
- Acquire it after receiving authorization before doing further work on planning,
  execution, and projection mutation.
- If acquisition reports that `APP_LOCK.js` exists, do no further work and tell 
  the user another editing operation may be active. An Agent may never treat an 
  existing lock as stale or remove it without explicit user authorization
  (although an Editor might within the running app).
- Keep the owner token for the entire logical operation. One lock must cover all
  related edits, generated assets, formatting, corrective changes, mutation-capable 
  verification, rollback, and cleanup.
- Verify that `APP_LOCK.js` still contains the Agent's token before each destructive
  phase and before release. If ownership is lost, stop changing files, perform
  only cleanup that cannot affect the other owner, leave its lock in place, and
  report the condition.
- Whether the operation succeeds or fails, attempt final release only after
  rereading `APP_LOCK.js` and confirming the token still matches. An Agent may 
  never remove a lock owned by another operation.

# Slide content file format

## Content files and keys

- Store each content Slide as
  `/src/content/<subject>/<category>/<section>/<slide>/slide.js`. The file assigns
  its Slide object to
  `window.umedAppContent['<subject>/<category>/<section>/<slide>']`.
- Landing Slides (`subject.js`, `category.js`, `section.js`) assign their Slide
  object to the key made from their folder path, i.e.,
  `window.umedAppContent['<subject>']`, `window.umedAppContent['<subject>/<category>']`
  and `window.umedAppContent['<subject>/<category>/<section>']`. The App landing
  Slide uses the key `app-overview`.
- App, Subject, Category, and Section landing Slides have immutable UUIDs so Learner
  notes remain associated with them when hierarchy routes change. The Framework's
  built-in error view is not a content Slide or a note-taking target.

## Slide fields

Every content Slide has the following top-level fields:
- `id`, a kebab-case unique identifier, unique within its `<subject>/<category>/<section>`
- `uuid`, an immutable canonical UUID v4 that uniquely identifies the Slide
  independently of its route. It is generated once when the Slide is created,
  is preserved when the Slide is edited, renamed, reordered, or moved, and is
  duplicated in the matching `content-index.js` Slide entry. A copied Slide is
  a new Slide and receives a new UUID.
- `schemaVersion`, an integer identifying the shape of this Slide object; UUID-bearing Slides use version `2`
- `level`, the Level of the Slide (`foundations`, `core-learning`, or `advanced-topics`)
- `order`, the rank order of a Slide within its Section
  - Increases across all Section Levels (Levels are not separately numbered)
  - Uses spaced values (e.g., increments of 10) so new Slides can be inserted
    without renumbering existing Slides
- `title`, a human-readable subject heading
- `hidden`, an optional boolean. When `true`, Presenter Mode skips the Slide during
  direct routing and forward/backward navigation. Learner and Editor Modes continue
  to show it normally. An omitted field is interpreted as `false`. This field applies
  to content Slides and every landing Slide type.
- `contentUpdatedAt`, an ISO 8601 timestamp recording when learner-facing Slide
  content or its title last changed. It is not changed for retained Agent
  instructions, navigation-only metadata (`level` or `order`), or widget-file
  generation. Agents that revise learner-facing content set it to the current
  timestamp; Editor Mode must set it whenever it saves a learner-facing Slide
  content or title change.
- `content`, a `blocks` array (see Slide content blocks below)

App, Subject, Category, and Section landing Slides use `schemaVersion: 2` and have
the shared `uuid`, `title`, optional `hidden`, and `content` fields above. Their hierarchy supplies their
route identity, so they do not carry content-Slide-only `id`, `level`, `order`, or
`contentUpdatedAt` fields.

## Slide content blocks

A Slide's `content` field has a `blocks` array. Each block has a `type` and
type-specific fields:
- `text` block: a `markdown` field containing CommonMark Markdown rendered by
  markdown-it: paragraphs, headings, bold, italic, inline code, code blocks,
  ordered/unordered lists, GFM tables, blockquotes, horizontal rules, links
  (opened in a new `umed-external` tab) and auto-linked URLs. A single newline
  renders as a line break. Raw HTML is not allowed (it is shown as literal
  text). Styling classes are supported using the Framework's custom markdown-it 
  plugin `textClassPlugin` with syntax `{.styling-class target text}`. Question  
  block `prompt` fields render as block Markdown, and Question choice text and 
  feedback render as inline-only Markdown.
- `image`, `link`, `widget`, and `dataFile` blocks additionally accept an
  optional `markdown` field, edited and rendered identically to the `text`
  block's `markdown` above. It renders immediately before that block's own
  content and lets an Editor attach short lead-in text that stays attached to,
  and reorders together with, the rest of that block's content.
- `image` block: `images` (an ordered array of objects, each with `source`
  (`"slide"` for an asset in the Slide folder, `"shared"` for an asset in
  `src/content/assets/images`, or `"url"` for an external URL) and `url` (the
  corresponding filename or URL)). Newly authored remote images must use an
  absolute `https://` URL; `http:`, `data:`, `blob:`, relative URLs, and URLs
  containing embedded credentials are not allowed. Remote images require
  network access and contact a third-party server. `label` is an optional
  visible caption, `alt` (required alt text),
  `maxWidths`
  (a space or comma-delimited list of raw CSS `max-width` values, e.g.
  `200px, 50%`, applied respectively to each entry in `images`; a
  single value applies to every image on the block; an empty, blank, or
  invalid-CSS entry falls back to `50%` for that image), `center` (a boolean;
  when true, centers the wrapper containing the block's image set; when false
  or omitted, left-aligns it), and `importedFrom` (optional provenance metadata
  naming the source file from which an image was imported; it is not rendered
  to Learners and is not a substitute for copyright attribution).
- `link` block: An external web site URL that opens via an `<a>` tag into a new 
  browser tab named `umed-external`, with a `label` and a `url` field for 
  constructing its tag.
- `widget` block: a kebab-case `name` field used for widget naming of
  `<widget>.js` files,
  `maxWidth` field with a raw CSS `max-width` value applied to the widget's
  wrapper (an empty, blank, or invalid-CSS value falls back to `90%`),
  `center` (a boolean; when true, centers the widget wrapper; when false or
  omitted, left-aligns it),
  `instructions` field filled with Agent markdown instructions by an Editor in 
  the app or by an Agent during automated content generation, and an 
  automated `instructionsUpdatedAt` ISO 8601 timestamp (not exposed in the
  Editor UI) set whenever `instructions` changes. See
  [Widget file generation](#widget-file-generation) for the runtime contract
  `<widget>.js` files must follow and how
  `instructionsUpdatedAt` is used to detect a stale `<widget>.js`.
- `dataFile` block: a kebab-case `name` field is the internal code
  identifier of a data file loaded for access by widgets, an `extensions` field
  is a space or comma-delimited
  list of allowed file extensions to load, and a `prompt` field with short text
  to show to ask for the file.
- `instructions` block: an `instructions` field containing retained instructions
  for an Agent. It is supported on individual Slides and Section landing Slides,
  shown only in Editor mode, and never rendered in Learner Mode.
  - On an individual Slide, it directs generation or revision of that Slide's
    learner-facing content. Editors save the Slide, then run
    `/build-app fill-or-update-slide <slide-path>`.
  - On a Section landing Slide, it directs generation or revision of multiple
    child Slides across that Section. Editors save the Section, then run
    `/build-app fill-or-update-section <section-path>`.
  - The Agent uses all retained instructions blocks in order and leaves them
    unchanged unless explicitly asked to remove them.
- `trustedSources` block: a Section-landing-only block stored in `section.js`, with
  a `files` array containing file names from that Section's `_trusted_sources`
  folder. On the Section landing slide, the files are rendered to Learners as
  links at the bottom of the slide contents, after an `<hr>` and explanatory
  text, but before bottom navigation. They remain excluded from GPT prompt text.
- `divider` block: renders an `<hr>` to visually separate Blocks on a Slide. It
  has no fields beyond `type` and does not accept a `markdown` lead-in.
- `gptFollowup` block: a Slide-only `questions` array of short learner-facing
  question strings suggested by an Editor for use with GPT. All nonblank
  questions from a Slide's `gptFollowup` blocks render together at the bottom
  of that Slide, after an `<hr>` and the heading "Suggested GPT follow-up
  prompts," regardless of the blocks' editor order. Each question has an
  "Ask GPT" icon button that appends that question after the quoted Slide
  text in the copied prompt; follow-up suggestions themselves are excluded
  from the quoted text.
- `question` block: a self-evaluation multiple-choice question, embeddable
  anywhere in a Slide's `blocks` array alongside any other block type. A
  Slide may contain any number of `question` blocks, mixed freely with other
  blocks:
  - `prompt`, the question text
  - `choices`, an array of two to five possible answers, each with:
    - `text`, the choice text
    - `correct`, a boolean
    - `feedback`, text explaining why the choice is correct or incorrect; the
      shared Question component automatically prefixes this with "Correct."
      or "Incorrect." (per that choice's `correct` value) when shown, so
      `feedback` itself should not repeat that word and may be left empty to
      show just the prefix.
  - Exactly one choice should have `correct: true`.
  - Answer feedback below the question is a fixed behavior of the shared
    Question component and is not configurable per-block.

# Content index file format and behavior

`content-index.js` is the single manifest of all Subject, Category, Section, and 
Slide metadata. It allows the app to build the sidebar, validate routes, and 
search content without loading every `slide.js` file, preserving load efficiency.

## Index structure

`content-index.js` assigns a nested object mirroring the content hierarchy to
`window.umedAppContentIndex`:

```js
window.umedAppContentIndex = {
  schemaVersion: 3,
  appOverviewUuid: 'f784d68c-b840-4890-a45d-7f7e663c9f4f',
  subjects: [
    {
      id: 'basic-genetics',
      uuid: '6c42c84d-c709-4ea3-af27-9b8677b88165',
      title: 'Basic Genetics',
      order: 10,
      categories: [
        {
          id: 'dna-and-rna',
          uuid: 'e7799075-d307-4281-9e7a-69ba371760a7',
          title: 'DNA and RNA',
          order: 10,
          sections: [
            {
              id: 'dna-structure',
              uuid: 'a6f4ff83-0354-4ea8-8812-1f595b62aad6',
              title: 'DNA Structure',
              order: 10,
              slides: [
                {
                  id: 'base-pairs',
                  uuid: 'd8a7e374-1928-4b1e-87f3-84c8739a2ae9',
                  title: 'Base Pairs',
                  level: 'foundations',
                  order: 120,
                  keywords: ['adenine', 'base', 'complementary', 'cytosine', 'guanine', 'pairs', 'thymine'],
                  keywordsUpdatedAt: '2026-10-03T19:39:06.309Z'
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};
```

- `appOverviewUuid` is the immutable UUID stored in `app-overview.js`.
- `subjects[].uuid`, `categories[].uuid`, and `sections[].uuid` mirror the immutable
  UUID in the corresponding landing Slide file. These identities are preserved when
  hierarchy entries are renamed, reordered, or moved.
- `subjects[].order`, `categories[].order` and `sections[].order` determine display order
  and default "first Section"/"first Slide" navigation targets, using the
  same spaced-increment convention as Slide `order`.
- `slides[].keywords` is an Agent-generated array of searchable terms used
  without loading full Slide content. Its extraction, normalization, and
  included Slide elements are governed by
  [Searching](#searching): every entry is one deduplicated lowercase word, and
  Slide-title words are included. It is not an Editor-authored field and does
  not include Category/Section landing-slide content or retained instructions.
- `slides[].keywordsUpdatedAt` is an ISO 8601 timestamp recording the
  `contentUpdatedAt` version from which `keywords` were generated. An Agent
  refreshes keywords when this field is absent or older than the Slide's
  `contentUpdatedAt`; it should not regenerate unchanged keyword lists merely
  because an indexing pass runs.
- The index does **not** duplicate full Slide `content`; only fields needed
  for navigation, routing, and search are present.
- Subject ids become top-level folders in `src/content` and content keys, so
  `assets` and `app-overview` are reserved and must not
  be used as Subject ids.
- A Subject-suppressed App has exactly one Subject entry. Its `id` and `title`
  both equal `app-subject`, its matching `subject.js` landing Slide has no
  Blocks, and all Category, Section, and Slide routes still begin with its id.
- App identity (`appUuid`, `appName`, `subjectsEnabled`) is not stored in the
  index; it is declared
  in the Parent root `app.js` (see [App identity and branding](#app-identity-and-branding)).
- Every hierarchy and content-Slide UUID in the index is the same immutable UUID
  stored in its corresponding content file and provides stable Slide identity when
  routes change.

## Maintaining the index
- The index must stay synchronized with the actual Slide files on disk.
- Every Slide UUID must be a canonical UUID v4, unique across the entire app,
  present in its content file and index entry, and identical in both places.
  Indexing and content-update operations must never regenerate an existing UUID.
- When an Agent creates, edits, or removes a Slide file, it must make the
  corresponding addition, update, or removal in `content-index.js` with the
  same change.
- When an Agent changes learner-facing Slide content, it must update that
  Slide's `contentUpdatedAt`, generate the normalized `keywords` list required
  by [Searching](#searching), and
  set the matching index entry's `keywordsUpdatedAt` to the same timestamp.
- `content-index.js` is not hand-maintained independently of Slide files; it
  is always a generated reflection of them.

# Educational content generation guidelines

Agent-generated content must be drawn from high-quality information sources:
- Information should be verifiable.
- When newer, less well verified information is presented, external links to 
  publications or other peer reviewed content should be provided.
- Section-level `_trusted_sources` folders allow Editors to provide context 
  files that:
  - Are trusted and allowed as information sources.
  - Should be prioritized when generating content, but should not be considered
    as exclusive context and can be supported by other content as outlined above.
  - Are not pushed to servers with the repository due to settings in `.gitignore`.
- Additional App-specific content guidance is provide by `../../AGENTS.md`, the 
  specific content generation prompt, and any applicable `instructions` blocks.

When generating content for a Section, you should:
- Order Slides to naturally build in difficulty within and across Levels.
- Break Slides into Levels at natural transitions when there are more than ten
  Slides in a Level.
    - It is not required to use all Levels for every Section of Slides.
- Add Question blocks at natural transition points:
  - Questions might appear every few Slides, added as a Question block on an
    existing Slide (usually at the bottom) or a Slide dedicated to one or more 
    Questions.
  - Do not add a Question with every slide.
  - Do not go more than five slides without a Question.
  - Use multiple choice format.
  - Immediately evaluate answers with feedback below the Question on why they 
    are correct or incorrect.
- Use GPT follow-up prompt suggestions (block type `gptFollowup`) to help avoid 
  creating bloated, overly-long Slides. 
  - To promote interactive learning, seek a balance between:
    - Providing educational content on Slides in the app; Slides should always
      be fully understandable as an educational unit on their own.
    - Providing guidance on ways to explore that content via GPT chat.
  - GPT follow-up prompt suggestions are not a required Slide block, but many 
    Slides are expected to benefit from one to three suggestions. Never have more 
    than five suggestions.
  - Keep suggestions short, typically one concise sentence or line of text. The
    suggested follow-up prompt will appear in generated prompt text after a 
    standard GPT app context and the Slide text, so follow-up suggestions only 
    need to provide a specific additional exploration of a Slide-related topic.
  - Suggestions should remain topical to the Slide and not go off on unrelated 
    tangents. Appropriate suggestions might explore sub-heading-level content 
    the Slide omitted for brevity, more advanced considerations, nuances or 
    tricky exceptions, etc. 

## Image content blocks
- Agents may generate new image content as well as text.
- You should generate line drawings and related art in SVG format compatible 
  with manipulation Adobe Illustrator.
- Some images might naturally require bitmap rendering in JPG format, e.g., 
  photographic content.
- You may embed public URL content with an image block entry whose `source` is
  `"url"` and whose `url` is an absolute `https://` URL. Do not use raw `<img>`
  tags, `http:`, `data:`, or `blob:` image sources.
  - Agents must include proper copyright/source attribution, preferably in the
    image block's `label`, otherwise in its `markdown`, or in a separate visible
    block dedicated to source attribution. Editors are responsible for doing the
    same when they add public image URLs in Editor Mode.
  - Prefer generated over linked images to minimize copyright issues, but do
    not attempt to recreate highly complex renderings.

# Widget file generation

- Agents generate reactive Javascript widgets such as interactive plots and tables.
- A widget block's `name` must be kebab-case because it also determines the
  `<widget>.js` filename and the widget registry key.
- Widgets may be conceived of autonomously by agents or prompted by Editors. 
  In either case, the widget block's `instructions` should carry the Agent 
  instructions for creating the widget along with `AGENTS.md`.

## Libraries and runtime contract

- These approved libraries are available globally to every `<widget>.js` file:
  - **Chart.js** for all plots and charts.
  - **Tabulator** for all interactive data tables.
  - **Sortable.js** for drag-and-drop ordering of list items, e.g., in
    put these in order exercises.
  - Agents must not introduce alternative plotting, table or drag-and-drop
    libraries. If these libraries cannot reasonably support a requested widget, 
    ask the Editor before adding a new one (see Code standards).
- Widget host contract: every `<widget>.js` file assigns a factory to
  `window.umedAppWidgets['<subject>/<category>/<section>/<slide>/<widget-name>']` with an
  `init(container)` method that builds the Chart.js/Tabulator instance (and any
  HTML input controls that make it interactive) inside `container`, and
  returns a `destroy()` callback used to tear the instance down when the
  Learner navigates away:
  ```js
  window.umedAppWidgets['getting-started/learning-basics/finding-your-way/navigating-slides/interactive-plot'] = {
    init(container) {
      const canvas = document.createElement('canvas');
      container.append(canvas);
      const chart = new Chart(canvas, { type: 'line', data: { /* ... */ } });
      return () => chart.destroy();
    }
  };
  ```
  - The Framework styles offer two optional helper classes for a widget's input
    controls: wrap them in an element with class `widget-controls` (a wrapping
    row) and give each labelled input a `widget-control` label.
  - `<widget>.js` files react only to their own HTML input controls (e.g. a
    slider rebuilding `chart.data` and calling `chart.update()`, or a
    Tabulator column header click). Widgets do not communicate with other
    widgets or Slides.
  - `<widget>.js` files are created by the Agent and contain:
    - The code and logic to populate the UI with the plot or table and the
      inputs required to make it interactive.
    - Bespoke data required to create the plot or table that cannot be calculated 
      by the widget. Data that can be calculated should not usually be included 
      in `<widget>.js` in favor of real-time derivation by the web browser.

## Generation workflow and staleness

- Widget generation is not a live, in-app edit like other block types, because
  the running web app cannot execute an Agent on the Editor's computer:
  - Editing a widget block's `name` or `instructions` field in Editor mode only
    updates the in-memory Slide object (enabling the Save button); it never
    creates, regenerates, or live-previews the `<widget>.js` file itself.
  - Editors must Save the Slide first, then separately prompt an Agent (outside
    the running app, e.g. in this coding environment) with the saved
    `instructions` and this `AGENTS.md` to create or update the `<widget>.js`
    file on disk.
- Detecting whether a `<widget>.js` file is stale relative to its Slide's
  saved instructions:
  - Every widget block carries an automated `instructionsUpdatedAt` ISO 8601
    timestamp (see Slide content blocks), refreshed by the Editor UI whenever
    `instructions` changes; Editors never set this directly.
  - Every Agent-generated `<widget>.js` file's first line must be a comment
    recording the `instructionsUpdatedAt` value it was generated from:
    `// Generated from widget block instructions last updated: <ISO timestamp>`
  - Before regenerating a `<widget>.js` file, an Agent compares that comment's
    timestamp to the block's current `instructionsUpdatedAt`. A match means
    the saved instructions have not changed since the file was last
    generated, so the Agent should confirm with the Editor before
    regenerating anyway, since nothing indicates the file needs it.

# DataFile blocks and widget data

- Widgets may access data uploaded by a user from an Upload File link defined by 
  block type `dataFile`. 
- Each `dataFile` block's `name` must be kebab-case; widget instructions and
  widget code use that exact name to identify the uploaded file.
- Any number of uniquely named files may be defined for use by one or more 
  widgets, across one or more Slides. The `dataFile` block only needs to be found
  on one Slide to load the data, but then can be used over multiple slides, i.e.,
  loaded data will persist in memory for the lifetime of the user's browser session.
- Authors of widget `instructions` must declare the names of the data file(s) 
  they require and the file format so data can be parsed.
- A `dataFile` block renders its `prompt` with an upload control restricted to
  `extensions`.
- Widget files access uploaded files through `window.umedDataFiles`, a
  session-lifetime, in-memory registry keyed by the `dataFile` block's `name`
  that never writes uploaded data to disk:
  - `window.umedDataFiles.get(name)` \u2192 the raw `File`, or `undefined` if not
    yet uploaded.
  - `window.umedDataFiles.getText(name)` / `.getArrayBuffer(name)` \u2192 a
    Promise for the file's contents, for widgets to parse themselves (no CSV
    or similar parsing library is approved; see
    [Widget file generation](#widget-file-generation)).
  - `window.umedDataFiles.onChange(name, callback)` \u2192 registers
    `callback(file)` for whenever `name`'s file is uploaded or replaced,
    calling it immediately if a file is already loaded (e.g. uploaded from a
    different Slide earlier in the session). Returns an unsubscribe function
    a widget's `destroy()` should call.
  - A widget that depends on a data file should use `onChange` in its
    `init(container)` to (re)draw whenever the file becomes available, rather
    than assuming it is already loaded.

# App version migration

In the future this section will include App version migration instructions when
breaking changes occur in the Framework.

# Security requirements
- Never place protected health information (PHI), credentials, copyrighted 
  downloads, secrets, or unsafe code in committed repository files, browser 
  storage, URLs, widget code, Slide content, or application logs.
- Screen all repository files for disallowed secure content as listed above prior
  to commit or push.
- Ensure that user actions with content beyond your control that might lead to 
  leaking of secure information communicate an appropriate caution in a 
  user-facing dialog before the action is executed in Javascript.
- URL query parameters are visible in browser history, bookmarks, referrers, and
  server logs.
