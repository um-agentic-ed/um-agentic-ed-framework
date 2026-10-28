# Import PowerPoint

## Usage

Invoke this skill after an Editor has entered a single PowerPoint file into the
target Section's `_trusted_sources` folder via an associated `trustedSources`
block and **saved** the Section. Retain every `instructions` block unless the
Editor explicitly asks to remove it. Create new Slides in the Section from the
imported PowerPoint file. Do not change content outside the target Section.

This skill performs a faithful, non-creative conversion: it reproduces the
PowerPoint's existing content in the Slide schema and does not summarize,
rewrite, add, or omit substantive content. Where repository or Section-tree-level
`instructions` would otherwise direct content generation, editorializing, or
omission, this skill's non-creative conversion rules take precedence;
retained instructions may only adjust scope-neutral details such as which
Section to target or how converted Slides are grouped.

Follow the slash command with the target, in either form:
- Shorthand: `/build-app import-powerpoint <subject>/<category>/<section>`.
- Plain language: describe the Section. Resolve it by searching
  `content-index.js`, never by guessing its path.

If no target was given and none can be inferred from the active editor file,
current selection, or chat context, ask the Editor which Section to target
before doing anything else.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the
[Framework AGENTS.md](../AGENTS.md) in full
before proceeding. Also read the target Section's own
`src/content/<subject>/<category>/<section>/AGENTS.md`, if one exists.

1. **Locate the Section and retained instructions.** Resolve the exact Section
   in `src/content/content-index.js`, then open
   `src/content/<subject>/<category>/<section>/section.js`. Find every
   `content.blocks` entry with `type: "instructions"`, in its existing order;
   later blocks take precedence over earlier ones when they conflict. If any
   exists, read them for guidance on scope-neutral details such as how to
   group converted Slides. Repository instructions and this skill's
   non-creative conversion rules remain authoritative over any retained
   instruction that asks for summarization, added commentary, or omitted
   content (see Usage). Ask the Editor before proceeding if a material
   ambiguity or conflict remains.
2. **Locate the PowerPoint file to convert.** Find and read the single
   PowerPoint file in the target Section's `_trusted_sources` folder that is
   referenced in the Section's `trustedSources` block. If none exists, stop
   and tell the Editor to add a PowerPoint file as a `trustedSources` block
   entry and save the Section in the app first; do not add one directly. If
   multiple PowerPoint files exist, ask the Editor which one to convert; this
   skill converts only one PowerPoint file at a time into a single Section.
3. **Check for a prior conversion of this file.** Search the target Section's
   existing child Slides for an `image` block `importedFrom` field that names
   this PowerPoint file. If any match
   is found, list the matching Slides and ask the Editor whether to skip,
   append additional Slides for PowerPoint slides not yet converted, or
   proceed anyway, rather than silently creating duplicate Slides.
4. **Inventory the Section before authoring.** Read every existing child
   `slide.js` file and the matching `content-index.js` entries in the target
   Section, plus the Section landing Slide in `section.js`. Note the highest
   existing `order` value and the Level of the last existing Slide. No
   pre-existing Slide of any type, including the Section landing Slide, is
   modified during conversion; only new Slides are added after the last
   existing Slide.
5. **Extract PowerPoint content with a deterministic tool.** Use a
   programmatic reader (for example `python-pptx`) to extract each slide's
   title placeholder, body/text placeholders, other text boxes in their
   original reading order, and embedded media. Use a rendering tool (for
   example PowerPoint automation or a headless LibreOffice `--convert-to png`
   pass) to export each whole slide as a single flattened image. If no such
   tool is available in the environment, stop and tell the Editor what needs
   to be installed rather than reconstructing slide content from visual
   inspection alone. Do all extraction work in a temporary working folder and
   delete it when finished; never leave extraction scratch files in the
   content tree.
6. **Identify each slide's unique content.** For each PowerPoint slide,
   compare its shapes against its slide layout and master. Treat placeholder
   text the slide itself supplies, and any shape not present on the layout or
   master, as that slide's unique content. Exclude shapes inherited unchanged
   from the layout or master (for example a logo, footer text, slide number,
   or repeating background), since these are not unique to any one slide.
7. **Create one new Slide per PowerPoint slide containing unique content.**
   Build Slides in the same order as the PowerPoint slides, using only
   content identified as unique in step 6:
   - Put the slide's title placeholder text in the new Slide's `title`
     field only; do not repeat it as a heading inside a `text` block.
   - Put remaining unique text, in original reading order, into one or more
     `text` blocks using standard Markdown (rendered by markdown-it): use
     `#`..`######` headings, `**bold**`, `*italic*`, and `` `code` ``;
     convert bullet and numbered lists to Markdown lists (`- item`,
     `1. item`, indented for nesting) rather than literal glyphs; and
     convert a PowerPoint table whose data is text into a Markdown pipe
     table. Raw HTML and Markdown images are not rendered; images are
     handled in steps 8-9. A single newline renders as a line break. If
     source text contains a literal `#`, `*`, `_`, `` ` ``, `|`, or `<`
     character that is not meant as Markdown, escape it with a backslash
     (`\*`) and note it in the report (step 15) if the intent is unclear.
     Preserve a complex table (merged cells, embedded graphics) faithfully
     via the full-slide render image in step 9 instead.
   - Do not include PowerPoint speaker notes as Slide content; if a slide's
     notes contain substantive unique content absent from the slide itself,
     flag it in the report instead.
8. **Convert embedded bitmap images.** For each unique bitmap image identified
   in step 6 (excluding vector shapes, handled in step 9), save it to the new
   Slide's folder as `source-image-N.<ext>` (`N` is its 1-based order of
   appearance on the slide), preserving its original bitmap format. Add a
   single `image` block for all of that slide's bitmap images together, with:
   - An `images` array listing every saved file for that slide in order, with
     each entry shaped as `{ "source": "slide", "url": "<saved file>" }`.
   - `alt` set to the source image's existing alt text if present, otherwise
     the literal fallback `"Image from slide <N> of <PowerPoint file name>."`.
   - `maxWidths: "45%"` when the block has more than one image, otherwise
     `"50%"`, matching existing converted Slides; `center: true`.
   - `importedFrom: "<PowerPoint file name>"` to retain the imported image's
     source-file provenance. Preserve any copyright attribution already visible
     within the source image.
9. **Render and add the full slide as a reference image.** Render drawings,
   shapes, charts, tables, and other non-bitmap content exactly as they
   appear using the rendering tool from step 5, then export the whole
   PowerPoint slide as one flattened image, saved as `source-composite.png`
   in the new Slide's folder. Add it as its own `image` block, after the
   bitmap-images block from step 8, with
   `images: [{ "source": "slide", "url": "source-composite.png" }]`,
   `alt: "Full rendering of source PowerPoint slide <N>."`, `maxWidths: "70%"`,
   `center: true`, and the same `importedFrom` value as step 8. This gives
   the Editor a visual reference for the original slide as a whole. Text inside
   the flattened image is not OCR-derived for search or GPT prompts; those use
   the converted text blocks and the image block's textual metadata.
10. **Convert explicit questions only.** Add a `question` block only when a
    PowerPoint slide explicitly poses a question with an identifiable single
    correct answer; populate `choices` and `correct` faithfully from the
    source and leave `feedback` empty if the source gives no explanation. Do
    not fabricate choices, feedback, or additional questions. Otherwise, keep
    question-like slide text as a plain `text` block; further question
    authoring is left to later edits outside this skill.
11. **Preserve identity and assign metadata.** Keep every retained Slide's
    existing `id`, UUID, and `slideSchemaVersion` unchanged. For each new Slide:
    use the title-placeholder text as its title; if that text is absent or
    empty, use the deterministic fallback `PowerPoint slide <N>`. Assign a
    kebab-case `id` derived from that title using the repository
    AGENTS.md's title-to-id rule (drop common words, keep adding whole words
    only while under budget, hard-truncate a single too-long word), prefixed
    with a two-digit sequence number continuing the existing `NN-` convention
    (append `-2`, `-3`, etc. if a derived id collides). The 20-character id
    limit applies to the complete id including this `NN-` prefix, so budget the
    title-derived portion to `20 - length("NN-")` characters (17 for a two-digit
    prefix); generate a new
    canonical UUID v4; set `slideSchemaVersion` to the current version declared
    in Framework `app/schema-contract.js`; set `order` to the prior
    existing Slide's highest `order` plus successive increments of 10,
    without renumbering any existing Slide; and set `level` to the same
    Level as the Section's last existing Slide (or the kebab-case identifier of
    the first available name in `app.js:window.umedAppIdentity.slideLevels`),
    applying one Level to the whole converted batch unless Levels are suppressed
    or a retained instruction explicitly directs specific Level breaks. Build the
    complete Slide object required by the Framework schema, including `id`,
    `uuid`, `slideSchemaVersion`,
    `contentUpdatedAt`, `title`, `order`, and `content.blocks` (plus `level` when
    Levels are enabled); do not rely on its folder, registration key, or index
    entry to substitute for a missing field. Do not modify the Section landing
    Slide's title, content, or
    retained instructions.
12. **Synchronize the manifest and search metadata.** Add the target
    Section's new Slide entries to `content-index.js`; do not modify or
    remove existing entries. For each new Slide, set the Slide file's
    `contentUpdatedAt` to the current ISO 8601 timestamp, generate its
    normalized lowercase single-word `keywords` under the repository Searching
    rules, and set the index entry's `keywordsUpdatedAt` to that same timestamp.
    Do not duplicate `contentUpdatedAt` in the index. Ensure every new index
    entry matches its Slide's id, UUID, title, level, and order. Write every
    generated or modified text file with UTF-8 encoding and LF (`\n`) line
    endings only, regardless of the host operating system or the PowerPoint
    extraction tool's native line endings.
    Normalize extracted text before serializing it so no carriage-return
    (`\r`) bytes are introduced into Slide files or `content-index.js`.
13. **Respect the Section boundary.** This skill only adds new Slide folders
    and assets and new `content-index.js` Slide entries within the target
    Section. It never edits `section.js` (including its `instructions` and
    `trustedSources` blocks), a Section-local `AGENTS.md`, or any other
    Category or Section. Do not create or regenerate widgets, which must be
    added after Slide conversion.
14. **Validate the result.** Check all changed JavaScript files for valid
    syntax; confirm every new Slide contains every field required in step 11
    and that its `id` exactly matches its folder name, registration key, and
    index entry; confirm the disk/index relationship and UUID uniqueness; verify
    Levels and ordering; confirm the number of new Slides matches the number
    of PowerPoint slides with unique content (step 6), and that every
    extracted embedded picture appears in some Slide's image block; confirm
    every referenced local asset file exists and opens as a valid, non-empty
    image; confirm `section.js`, the PowerPoint file, and all pre-existing
    Slides are byte-for-byte unchanged; confirm no protected health
    information, credentials, secrets, or copyrighted downloads were added;
    confirm every generated or modified text file contains no carriage-return
    (`\r`) bytes and therefore uses LF-only line endings; and confirm temporary
    extraction files were deleted. Preserve the standard
    `window.umedAppContent[...]` assignment format.
15. **Report.** Summarize the mapping from PowerPoint slide number to new
    Slide id; list any PowerPoint slides skipped as non-unique (step 6) or
    containing unsupported elements (complex tables, notes, stray Markdown
    characters, etc., per steps 7 and 9); state the Level and `order` range
    assigned; and flag any decisions needing Editor review.

