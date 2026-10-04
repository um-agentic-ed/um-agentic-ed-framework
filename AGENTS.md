# Project overview

`um-agentic-ed` is a system for building education web apps. This repository, `um-agentic-ed-framework`, is the Framework Submodule that is reused across 
many Apps. It is wrapped by all App Parents, which themselves are always cloned  
from the `um-agentic-ed-parent` repository.

# Coding agent instruction sources

All prompts that use instructions in this `AGENTS.md` file should have already 
read the `AGENTS.md` file in the Parent, i.e., file `../AGENTS.md` relative to 
the path to this Framework `AGENTS.md` file. The two files together define the 
instructions for a complete App. 

You will know if the Parent `../AGENTS.md` file has been read if you have access 
to markdown section `# um-agentic-ed system overview`, which is defined in the 
Parent instructions. If you do not have sufficient instructions you should stop, 
take no action, and inform the user that Agent work on `um-agentic-ed-framework` 
must be coordinated in the context of a repository cloned from `um-agentic-ed-parent`.

# Coding agent roles
- Act as a fully qualified and experience software engineer when writing 
  framework code.

# App usage modes

The app has three page states:
- *Learner Mode* is the default state where Learners view and interact with 
  educational content, take notes on third-level Slides, and follow up using GPT. 
- *Editor Mode* is toggled by Ctrl-click (Cmd-click on Mac) on the app title in 
  the header, which activates list actions and an editing pane while leaving the 
  current route unchanged.
  - List actions and inputs in the editing pane allow in-app content editing with 
    immediate live updates in the Editor's browser whenever possible.
  - Editors must give access to the root folder of their App's Parent repository 
    via the Chrome File System Access API to save permanent changes. The Editor 
    checks that the folder contains `src/content` and that its `app.js` declares 
    this App's `appUuid`, and then writes only inside `src/content`.
  - Editor Mode is only honored for `file:///` URLs and disabled when the app is
    served by a web file server.
  - Editor Mode is not secured; anyone can edit their local repository clone.
- *Presenter Mode* is a variation of Learner Mode optimized for projected views
  of content with an interactive whiteboard.

# Browser support
- Learner and Presenter Modes must work on all common web browsers including 
  Chrome, Edge, and Safari. 
- Editor Mode requires Chrome or another browser that supports the File System 
  Access API `showDirectoryPicker()`.

# App implementation
- The app mainly uses a static file implementation without a web server. 
- Users open the app locally from `<app-target>.html` on their file system, i.e.,
  as `file:///<app-target>.html`.
- Inputs and widgets are stateless between sessions, except for values stored
  in files or IndexedDB as defined below.
- A web file server can serve the static app in Learner and Presenter Modes with
  no back-end server logic.

# Code standards
- Use HTML, CSS and Javascript.
- Provide page content as static files.
- Content slides may use embedded reactive Javascript widgets when it benefits 
  learning, e.g., plots with settable interactive parameters.
- Standard third-party code libraries are allowed but must be approved before
  adding them to the codebase:
  - Download third-party libraries using a pinned CDN when possible.
  - The following libraries are APPROVED: 
    - Use Chart.js for all plots and charts in `widget` blocks.
    - Use Tabulator for all interactive data tables in `widget` blocks.
    - Use Sortable.js for drag-and-drop list reordering, both in Editor mode (e.g.
      the Slides menu's per-Level lists, and sidebar Category/Section lists) and
      in widget blocks (e.g. "put these in order" exercises).
    - Use Fabric.js for the interactive whiteboard; loaded when Presenter mode is 
      first entered.

Application code should remain shared, modular and generic, using a standardized 
data structure for all content.

# Hierarchical content organization

Educational content is structured in hierarchical levels:
- An *App* is focused on one broad educational context or disipline, e.g., a 
  college course.
- A *Subject* defines one focus area in the context of the App.
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
  - Slide may have zero, one, or mutliple instances of any Block type.
- Thus:
  - An App has one or more Subjects.
  - A Subject has one or more Categories.
  - A Category has one or more Sections.
  - A Section has one to three Levels, as needed.
  - A Level has zero or more Slides.
  - A Slide has a title and one or more Blocks.
- A nested Subject, Category, Section, and Slide define the hierachical path to  
  one content unit in the App and its associated files. In contrast, Level is a 
  Slide attribute helps organize Slide navigation within a Section, and all 
  Block files and definitions are stored in the parent Slide's folder and 
  description.

# App layout and styles

## Page layout and styling

The page layout and styles are mature and will not change frequently and not 
unless you are requested to change them. Use the existing codebase as your guide. 

Hierarchical levels are reflected in the app:
- Subjects are shown on the App landing Slide and switched via a popup menu in the 
  header, to the right of the app title. In Editor Mode that menu works like the 
  Slides menu: hover "+" buttons between and around Subjects add a new Subject, 
  and dragging reorders them. 
- The sidebar has:
    - A top-level entry for each Category in a Subject. Category Section 
      visibility is exclusive; inactive Categories are collapsed.
    - Nested Section entries under each Category.
- Levels are reflected in navigation elements at the top of the content page.
- One Slide occupies the content pane at a time (and the editor pane in Editor mode).

App developers may brand their app in two ways:
- Color selections for the header and sidebar declared in the `app.css` file 
  found in the parent root (see [App identity and branding](#app-identity-and-branding)).
- Images or other content included on Slides.

## App identity and branding

Values that differ between Apps, and that the Framework cannot derive from 
content, are declared in two small files in the Parent root. Editors set them 
once when creating an App, by hand or with the `set-app-identity` skill:
- `app.js` assigns `window.umedAppIdentity`, an object with fields:
  - `appUuid`: immutable canonical UUID v4 of the logical App. It must be 
    unique per App and never change; Learner notes are keyed to it in 
    IndexedDB and validated against it in exported notes files.
  - `appName`: stable, filesystem-safe kebab-case name. It supplies the 
    `<appName>.notes.json` export filename and notes file metadata; `appUuid`,
    not `appName`, is authoritative when validating an imported notes file.
  - `appTitle`: human-readable title, shown in both the app header and the 
    browser tab. The HTML entrypoint carries no title of its own.
  - `discipline`: the subject area Learners study, used with `learnerLevel` as 
    context in prompts sent to AI chat assistants.
  - `learnerLevel`: the typical Learner the App targets, as an adjective phrase 
    that fits "I am a ___ learner" (e.g., "undergraduate", "post-graduate").
  - `chatbotUrl`: the `https://` (or `http://`) address of the AI chatbot to open 
    when a Learner asks about a Slide, since developers prefer different chatbots. 
    The prompt, with the Slide text, is copied to the clipboard for pasting there. 
    If blank or invalid, prompts are still copied but no chatbot is opened or linked.
- `app.css` sets CSS custom properties on `:root` that override Framework 
  defaults: `--umed-brand-bg`, `--umed-brand-text`, `--umed-brand-hover-bg`, 
  `--umed-brand-border` and `--umed-brand-accent`. 

The HTML entrypoint loads the Framework stylesheet (`framework.css`) before the
Parent `app.css`, and the Parent `app.js` before any Framework script.

# Routing
- The hierarchical path to the current content is reflected in the visible URL.
- There should be a functioning Back button and history.
- The URL format should use hashes followed by paths that mirror the 
  hierarchical content tree structure:
    - Pattern: `file:///<path>/<app-target>.html#/<subject>/<category>/<section>/<slide>`
    - Levels are not part of a path; they are a Slide-level attribute.
- Navigating to a partial path shows its single overview, a.k.a "landing", slide:
  - The Slide for URL `#/<subject>/<category>/<section>` is read from landing slide
    `/src/content/<subject>/<category>/<section>/section.js`.
  - The Slide for URL `#/<subject>/<category>` is read from landing slide
    `/src/content/<subject>/<category>/category.js`.
  - The Slide for URL `#/<subject>` is read from landing slide
    `/src/content/<subject>/subject.js`.
  - The Slide for a URL with no hashed route, an empty hash `#`, or the root  
    hash `#/` is read from `/src/content/app-overview.js`. This landing Slide also 
    lists links to all Subjects.
- An invalid route displays the error Slide in `/src/content/routing-error.js`.

# Searching
- Keywords are individual deduplicated lower-cased words extracted from content  
  Slide `slide.js` files. They are not taken from Subject, Category or Section  
  landing slide files `subject.js`, `category.js` or `section.js`. Slide text 
  should be split at whitespace and hyphens when extracting candidate keywords. 
  All punctuation should be removed from the outsides of words, but not when it 
  appears within a candidate keyword; thus, "Height, and Width!" becomes keywords 
  "height" and "width", but "A(B)C and XYZ:123" become keywords "a(b)c" and 
  "xyz:123". Slide text is defined as any word the Learner would see in the 
  content pane, but does not include any code elements used to generate that 
  visible text or GPT prompts. Thus:
  - Included elements are:
    - Slide title
    - text and markdown lead-ins
    - image alt text and visible caption/label
    - link labels
    - data-file prompts
    - question prompts, choices, and feedback
    - widget block markdown/instructions shown to Learners
  - Excluded elements are:
    - retained instructions blocks
    - widget JavaScript source, internal identifiers, and data/code values
    - Subject, Category and Section landing slides
    - GPT follow-up prompts
- Users type in the search box to find content with matching keywords. The search
  query should be trimmed of leading and trailing whitespace, then split on
  whitespace and hyphens with punctuation removed by the same rules as for keywords. 
  Each resulting substring is taken as the prefix of a searchable keyword, up 
  to an entire keyword. Match results from each substring are intersected to produce  
  the final match list to support multi-word queries that progressively refine 
  lists as more terms are added.
- Search queries should:
  - Activate after at least three characters are entered, and any query term less
    than three characters should be ignored. Thus, indexed keywords will also be 
    at least three characters long.
  - Not match on trivial or low complexity queries like common English words 
    including but not limited to articles, prepositions, and frequently used verbs. 
    All such words should be omitted from keyword indices to keep them efficient. 
    Indexed keywords should be specific to the unique content of the app.
  - Match by comparing the requested search box text to the beginning of indexed 
    content keywords in a case-insensitive manner. Indices and code strategies
    should be constructed to optimize start-of-word matching.
  - Match sensitively such that any high-value word on any Slide should exist
    in the keyword index for search matching, although the search term may only 
    generate Subject, Category or Section matches if too many Categories, Sections 
    or Slides match as described below.
  - Use debouncing to prevent too-frequent recalculation of the match list.
- A search box match list should be generated in response to user queries that 
  provides links with valid URLs at all helpful tree levels according the 
  the following rules:
  - Show at most the hierarchical tree levels Subject, Category, Section and Slide.  
    How many of these levels are shown for a current search match is determined by
    the number of sub-elements that would be displayed.
    - If a Section has more than three slides that match a search prefix, then
      only Subject, Category and Section should be included in the match list for  
      that Section, but not the numerous Slides.
    - If a Category has three or more Sections that match, then only the Subject 
      and Category should be included in the match list for that Category.
    - If a Subject has three or more Categories that match, then only the Subject 
      should be included in the match list for that Subject.
    - The previous rules should be interpreted per Subject, Category and Section,
      e.g., it is possible that one Section would have specific Slides listed,   
      while another would not list Slides in the match list because it had more  
      then three matching Slides.
    - The previous rules dictate the behavior of prefixes and keywords that are:
      - common within the app's specific content
      - but not in general language. 
      At the other extreme, some keywords (and sufficiently long search entries) 
      will be  highly unique and may generate just one or two Slide matches that 
      should be communicated with full Subject, Category, Section and Slide in 
      the match tree. Finding all such matches is important to effective searching.
  - Subject, Category, Section and Slide in the search match list should occupy 
    at most one line of text, using an ellipsis overflow for long entries.
- Because matching keywords are not themselves displayed in the match list, 
  and because any single instance on a Slide is sufficient to generate a query
  match, keyword stores should be maintained as deduplicated lowercase strings.

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
  <app-target>.html  App HTML entrypoint, renamed as required by the App from index.html
  src/               Generated app code and structured educational content
```

## `/src/` file tree

```text
/src/
  content/                  Files that define the App-specific educational content
  um-agentic-ed-framework/  A Submodule clone of this `um-agentic-ed-framework` repository
```

## `/src/um-agentic-ed-framework/` file tree

```text
/src/um-agentic-ed-framework/
  AGENTS.md    This file
  app/         main.js: application bootstrap, routing, rendering and global state
  components/  Shared UI components and services
  editor/      Files that support Editor mode
  styles/      framework.css: the Framework stylesheet, in numbered sections
```

Script loading: `index.html` loads the Framework scripts the Learner view needs
(components and `app/main.js`). Editor mode and the Presenter whiteboard are used
only occasionally, so `main.js` loads them on first use instead:
- Turning on Editor mode (Ctrl-click on the app title) loads `editor/file-access.js` 
  and `editor/editor.js`.
- Entering Presenter mode loads Fabric.js and `components/presenter-whiteboard.js`.
New Framework code that is only needed in one of these modes should be loaded the 
same way, not added to `index.html`.

## `/src/content/` file tree

```text
/src/content/
  app-overview.js          Top-level Slide shown on app start
  content-index.js         Master file with metadata for all Subjects, Categories, Sections and Slides
  routing-error.js         Slide shown for a malformed route
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
          <asset>.jpg      Slide-specific asset files reside in the same folder as their slide.js
          <widget>.js      Agent-authored plot or table matching the widget host contract (see Widget content blocks)
```

Section-level `AGENTS.md` files provide guidance on how to populate educational 
content and build widgets, but the Parent and Framework `AGENTS.md` files remain
the authoritative instructions for app structure.

Section titles, descriptions, and other Section-level metadata not tied to
individual Slides are stored in `content-index.js`.

# Slide content file format

Content files:
- Do not need to be human readable; all human editing is done in the running app.
- Must be easily rendered into both Learner Slide view and Editor inputs using 
  shared, generic rendering code, not bespoke per-Slide code.
- Should be optimized for low page load latency.
- Must be loadable by a web browser accessing local files without hitting CORS 
  restrictions.
- Are therefore stored as one Javascript file per Slide loaded via
  `<script src="/src/content/<subject>/<category>/<section>/<slide>/slide.js">`,
  which assigns the Slide object to `window.umedAppContent['<subject>/<category>/<section>/<slide>']`.
- Landing Slides (`subject.js`, `category.js`, `section.js`) are loaded the same way
  and assigned to the key made of their folder path, i.e.,
  `window.umedAppContent['<subject>']`, `window.umedAppContent['<subject>/<category>']`
  and `window.umedAppContent['<subject>/<category>/<section>']`. The App landing and
  error Slides use the keys `app-overview` and `routing-error`.

## Slide fields

Every Slide has the following top-level fields:
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
- `contentUpdatedAt`, an ISO 8601 timestamp recording when learner-facing Slide
  content or its title last changed. It is not changed for retained Agent
  instructions, navigation-only metadata (`level` or `order`), or widget-file
  generation. Agents that revise learner-facing content set it to the current
  timestamp; Editor Mode must set it whenever it saves a learner-facing Slide
  content or title change.
- `content`, a `blocks` array (see Slide content blocks below)

## Slide content blocks

A Slide's `content` field has a `blocks` array. Each block has a `type` and
type-specific fields:
- `text` block: a `markdown` field containing plain text with a small
  controlled set of Markdown formatting: bold (`**text**`), italic
  (`*text*`), inline code (`` `text` ``), and heading lines (`#` through
  `######`, rendered as `<h1>`–`<h6>`). Raw HTML is not allowed to keep the
  Editor input a simple text area and avoid unsanitized markup.
- `image`, `link`, `widget`, and `dataFile` blocks additionally accept an
  optional `markdown` field, edited and rendered identically to the `text`
  block's `markdown` above, but shown as the first input row in the Editor
  pane and rendered immediately before that block's own content in the
  Slide view. It lets an Editor attach short lead-in text that stays
  attached to, and reorders together with, the rest of that block's content.
- `image` block: `src` (relative path), `alt` (required alt text), `maxWidths`
  (a space or comma-delimited list of raw CSS `max-width` values, e.g.
  `200px, 50%`, applied respectively to each file in `src`/`fileName`; a
  single value applies to every image on the block; an empty, blank, or
  invalid-CSS entry falls back to `50%` for that image), `center` (a boolean;
  when true, centers the wrapper containing the block's image set; when false
  or omitted, left-aligns it), and `attribution`
  (a string with source name/link, or `null` for original content).
- `link` block: An external web site URL that opens via an `<a>` tag into a new 
  browser tab named `umed-external`, with a `label` and a `url` field for 
  constructing its tag.
- `widget` block: `name` field used for widget naming of `<widget>.js` files, 
  `maxWidth` field with a raw CSS `max-width` value applied to the widget's
  wrapper (an empty, blank, or invalid-CSS value falls back to `90%`),
  `center` (a boolean; when true, centers the widget wrapper; when false or
  omitted, left-aligns it),
  `instructions` field filled with Agent markdown instructions by an Editor in 
  the app or by an Agent during automated content generation, and an 
  automated `instructionsUpdatedAt` ISO 8601 timestamp (not exposed in the 
  Editor UI) set whenever `instructions` changes. See Widget content blocks 
  below for the runtime contract `<widget>.js` files must follow and how 
  `instructionsUpdatedAt` is used to detect a stale `<widget>.js`.
- `dataFile` block: a `name` field is the internal code identifier of a data file 
  loaded for access by widgets, an `extensions` field is a space or comma-delimited 
  list of allowed file extensions to load, and a `prompt` field with short text
  to show to ask for the file.
- `instructions` block: an `instructions` field containing retained instructions
  for an Agent. It is supported on individual Slides and Section landing Slides,
  shown only in Editor mode, and never rendered in Learner Mode.
  - On an individual Slide, it directs generation or revision of that Slide's
    learner-facing content. Editors save the Slide, then run
    [`fill-or-update-slide`](../../.github/skills/fill-or-update-slide/SKILL.md) with
    the Slide path.
  - On a Section landing Slide, it directs generation or revision of multiple
    child Slides across that Section. Editors save the Section, then run
    [`fill-or-update-section`](../../.github/skills/fill-or-update-section/SKILL.md)
    with the Section path.
  - The Agent uses all retained instructions blocks in order and leaves them
    unchanged unless explicitly asked to remove them.
- `trustedSources` block: a Section-landing-only block stored in `section.js`, with
  a `files` array containing file names from that Section's `_trusted_sources`
  folder. On the Section landing slide, the files are rendered to Learners as
  links at the bottom of the slide contents, after an `<hr>` and explanatory
  text, but before bottom navigation. They remain excluded from GPT prompt text.
  Editors add, overwrite, and remove these files through the block's file
  controls using the File System Access API.
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
  - In Editor mode, a Question block's `choices` are reordered via their own
    nested sortable list, itself nested inside the Slide's outer sortable
    list of Blocks.

# Content index file format and behavior

`content-index.js` is the single manifest of all Subject, Category, Section, and 
Slide metadata. It allows the app to build the sidebar, validate routes, and 
search content without loading every `slide.js` file, preserving load efficiency.

## Loading and structure
- Loaded once via `<script src="/src/content/content-index.js">`, which
  assigns the index to `window.umedAppContentIndex`.
- Structured as a nested object mirroring the content hierarchy:

```js
window.umedAppContentIndex = {
  schemaVersion: 2,
  subjects: [
    {
      id: 'basic-genetics',
      title: 'Basic Genetics',
      order: 10,
      categories: [
        {
          id: 'dna-and-rna',
          title: 'DNA and RNA',
          order: 10,
          sections: [
            {
              id: 'dna-structure',
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

- `subjects[].order`, `categories[].order` and `sections[].order` determine display order
  and default "first Section"/"first Slide" navigation targets, using the
  same spaced-increment convention as Slide `order`.
- `slides[].keywords` is an Agent-generated array of searchable terms used
  without loading full Slide content. Its exact extraction, normalization,
  included Slide elements, and prefix-match behavior are governed by
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
  `assets`, `app-overview` and `routing-error` are reserved and must not
  be used as Subject ids; Editor Mode adds a numeric suffix if a title would
  produce one.
- App identity (`appUuid`, `appName`) is not stored in the index; it is declared 
  in the Parent root `app.js` (see [App identity and branding](#app-identity-and-branding)).
- `slides[].uuid` is the same immutable UUID stored in the corresponding
  `slide.js`; it provides stable Slide identity when routes change.

## Behavior
- On app load, the index is fetched immediately (before any Slide content),
  and drives:
  - Sidebar Category/Section rendering.
  - Route validation (a hash path is valid only if it resolves to an entry
    in the index; otherwise the error Slide is shown).
  - Default-slide resolution for partial routes (lowest `order` match within
    the requested Category/Section).
  - Search suggestions (prefix-matching indexed content-Slide keywords, then
    deriving Category and Section result links from those Slide matches).
- Individual `slide.js` files are only loaded on demand, when a Learner
  navigates to that specific Slide (see Routing and Slide content file
  format sections).

## Maintaining the index
- The index must stay synchronized with the actual Slide files on disk.
- Every Slide UUID must be a canonical UUID v4, unique across the entire app,
  present in both `slide.js` and its index entry, and identical in both places.
  Indexing and content-update operations must never regenerate an existing UUID.
- When an Agent creates, edits, or removes a Slide file, it must make the
  corresponding addition, update, or removal in `content-index.js` with the
  same change.
- When an Agent changes learner-facing Slide content, it must update that
  Slide's `contentUpdatedAt`, generate the normalized `keywords` list required
  by [Searching](#searching), and
  set the matching index entry's `keywordsUpdatedAt` to the same timestamp.
  The [`index-slides`](../../.github/skills/index-slides/SKILL.md) skill performs this
  maintenance in bulk and validates the disk/index relationship.
- When an Editor uses in-app Editor mode to save a change that creates, edits, 
  reorder, or deletes a Slide, the app must update both the Slide's `slide.js` 
  file and `content-index.js` together via the File System Access API, so the 
  two stay in sync.
- `content-index.js` is not hand-maintained independently of Slide files; it
  is always a generated reflection of them.

# Learner note taking

To facilitate active learning a textarea notepad can be opened in Learner mode 
where users can record notes about Slides. The notepad is not offered on App, 
Subject, Category, or Section landing Slides. Notes are cached in memory for immediate 
interaction and saved automatically to IndexedDB using the immutable App and Slide 
UUIDs, so they persist across browser sessions without modifying content files. 
Learners may export an unencrypted `<appName>.notes.json` archival/shareable copy. 
A valid same-App notes file can either atomically replace the Learner's saved 
notes or be viewed temporarily as read-only shared notes without altering their own.

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
- Additional App-specific content guidance is provide by `../AGENTS.md`, the 
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
  - Suggesions should remain topical to the Slide and not go off on unrelated 
    tangents. Appropriate suggestions might explore sub-heading-level content 
    the Slide omitted for brevity, more advanced considerations, nuances or 
    tricky exceptions, etc. 

## Image content blocks
- Agents may generate new image content as well as text.
- You should generate line drawings and related art in SVG format compatible  
  with manipulation Adobe Illustrator.
- Some images might naturally require bitmap rendering in JPG format, e.g., 
  photographic content.
- You are allowed to embed public URL content such as `<img>` tags:
  - Include attribution and a link to the primary site.
  - Prefer generated over linked images to minimize copyright issues, but do
    not attempt to recreate highly complex renderings.

## Widget content blocks
- Agents generate reactive Javascript widgets such as interactive plots and tables.
- Widgets may be conceived of autonomously by agents or prompted by Editors. 
  In either case, the widget block's `instructions` should carry the Agent 
  instructions for creating the widget along with `AGENTS.md`.
- Approved widget libraries are loaded once via pinned CDN `<script>`/`<link>`
  tags in `<app-target>.html` and are available globally to every `<widget>.js`
  file:
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
  - `src/um-agentic-ed-framework/components/widget-host.js` is the only app code that loads
    `<widget>.js` files and calls `init`/`destroy`; it is shared, generic
    infrastructure and must not contain any per-widget logic.
  - The Framework styles offer two optional helper classes for a widget's input
    controls: wrap them in an element with class `widget-controls` (a wrapping
    row) and give each labelled input a `widget-control` label.
  - `<widget>.js` files react only to their own HTML input controls (e.g. a
    slider rebuilding `chart.data` and calling `chart.update()`, or a
    Tabulator column header click). Widgets do not communicate with other
    widgets or Slides.
  - `widget>.js` files are created by the Agent and contain:
    - The code and logic to populate the UI with the plot or table and the
      inputs required to make it interactive.
    - Bespoke data required to create the plot or table that cannot be calculated 
      by the widget. Data that can be calculated should not usually be included 
      in `widget>.js` in favor of real-time derivation by the web browser.
- Widget generation is not a live, in-app edit like other block types, because
  the running web app cannot execute an Agent on the Editor's computer:
  - Editing a widget block's `name` or `instructions` field in Editor mode only
    updates the in-memory Slide object (enabling the Save button); it never
    creates, regenerates, or live-previews the `<widget>.js` file itself.
  - Editors must Save the Slide first, then separately prompt an Agent (outside
    the running app, e.g. in this coding environment) with the saved
    `instructions` and this `AGENTS.md` to create or update the `<widget>.js`
    file on disk.
  - Until an Agent has authored a matching `<widget>.js` file, the Slide shows
    a placeholder noting the widget has not yet been generated, instead of an
    error.
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
- Editors prompt an Agent to create or update a `<widget>.js` file by running
  [`create-or-update-widget`](../../.github/skills/create-or-update-widget/SKILL.md)
  in VS Code chat, pointed at the target Slide and widget.

## DataFile content blocks
- Widgets may access data uploaded by a user from an Upload File link defined by 
  block type `dataFile`. 
- Any number of uniquely named files may be defined for use by one or more 
  widgets, across one or more Slides. The `dataFile` block only needs to be found
  on one Slide to load the data, but then can be used over multiple slides, i.e.,
  loaded data will persist in memory for the lifetime of the user's browser session.
- Authors of widget `instructions` must declare the names of the data file(s) 
  they require and the file format so data can be parsed.
- On the Slide itself, a `dataFile` block renders its `prompt` text followed
  inline by a small upload icon button (the same icon used for the Editor
  pane's image upload button); clicking it opens a native file picker
  restricted to `extensions`. 
- `src/um-agentic-ed-framework/components/data-files.js` is shared, generic infrastructure providing
  `window.umedDataFiles`, a session-lifetime, in-memory registry of uploaded
  files keyed by a `dataFile` block's `name`. It is the only app code that
  stores or looks up an uploaded file, and it never touches disk. A
  `<widget>.js` file reads a Learner-uploaded file via:
  - `window.umedDataFiles.get(name)` \u2192 the raw `File`, or `undefined` if not
    yet uploaded.
  - `window.umedDataFiles.getText(name)` / `.getArrayBuffer(name)` \u2192 a
    Promise for the file's contents, for widgets to parse themselves (no CSV
    or similar parsing library is approved; see Widget content blocks).
  - `window.umedDataFiles.onChange(name, callback)` \u2192 registers
    `callback(file)` for whenever `name`'s file is uploaded or replaced,
    calling it immediately if a file is already loaded (e.g. uploaded from a
    different Slide earlier in the session). Returns an unsubscribe function
    a widget's `destroy()` should call.
  - A widget that depends on a data file should use `onChange` in its
    `init(container)` to (re)draw whenever the file becomes available, rather
    than assuming it is already loaded.

# Security requirements
- Never place protected health information (PHI), credentials, copyrighted 
  downloads, or secrets in committed repository files, browser storage, URLs, or 
  application logs.
- Screen all repository files for disallowed secure content as listed above prior
  to commit or push.
- Ensure that user actions with content beyond your control that might lead to 
  leaking of secure information communicate an appropriate caution in a 
  user-facing dialog before the action is executed in Javascript.
- URL query parameters are visible in browser history, bookmarks, referrers, and
  server logs.
