# Fill or update section

## Usage

Invoke this skill after an Editor has created or revised a Section landing Slide,
filled Agent instructions into one or more `instructions` blocks in Editor
mode, and **saved** the Section. Retain every `instructions` block unless the
Editor explicitly asks to remove it. Create, revise, organize, or, only when
explicitly requested, remove child Slides as needed to fulfill the Section-wide
brief. Do not change content outside the target Section.

Follow the slash command with the target, in either form:
- Shorthand: `/build-app fill-or-update-section <subject>/<category>/<section>`.
- Plain language: describe the Section. Resolve it by searching
  `content-index.js`, never by guessing its path.

If no target was given and none can be inferred from the active editor file,
current selection, or chat context, ask the Editor which Section to target
before doing anything else.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the [Framework AGENTS.md](../AGENTS.md) in full before proceeding. Also read the
target Section's own `src/content/<subject>/<category>/<section>/AGENTS.md`, if one
exists, and all files in its `_trusted_sources` folder that are relevant to the
brief.

1. **Locate the Section and retained instructions.** Resolve the exact Section
   in `src/content/content-index.js`, then open
   `src/content/<subject>/<category>/<section>/section.js`. Find every `content.blocks`
   entry with `type: "instructions"`, in its existing order. If none exists,
   stop and tell the Editor to add an Instructions block to the Section landing
   Slide and save the Section in the app first; do not add one directly.
2. **Inventory the Section before authoring.** Read every existing child
   `slide.js` in the target Section and its matching `content-index.js` entries.
   Assess the current sequence, Levels, coverage, duplication, learner
   progression, retained Slide-level instructions, and relevant trusted
   sources. Do not inspect or modify another Section merely to expand the
   requested scope.
3. **Use the instructions as the Section-level brief.** Combine saved Section
   instruction text in block order with the Section title, Section-local
   `AGENTS.md`, trusted sources, existing Slide-level instructions, and
   repository requirements. Later Section instruction blocks take precedence
   over earlier ones. Repository instructions remain authoritative; ask the
   Editor before making changes if a material ambiguity or conflict remains.
4. **Plan and author the child Slides.** Create or revise as many Slides in the
   target Section as needed to fulfill the brief. Build a coherent progression
   within and across `foundations`, `core-learning`, and `advanced-topics`, using
   only the Levels the subject needs. Follow the Slide schema and educational
   guidance, including trustworthy sources, digestible scope, suitable question
   blocks, safe Markdown, visible attribution for public URL images, and
   approved widget/data-file contracts. Preserve existing Slide-level `instructions` blocks in their
   relative order and follow them when revising their Slide. Do not remove an
   existing Slide unless the saved Section instructions explicitly require its
   removal; if deletion intent is ambiguous, ask first.
5. **Preserve identity and assign metadata.** Keep every retained Slide's
   existing `id`, UUID, and `schemaVersion`. Reordering or changing a Slide's
   title does not change its UUID or imply an id/path rename. If the saved brief
   explicitly requires an id/path rename, preserve the UUID and coordinate the
   folder, registration key, index entry, and any Slide-local asset or widget
   references. Give each genuinely new Slide a unique kebab-case id (following
   the repository AGENTS.md's 20-character title-to-id rule: drop common words,
   keep adding whole words only while under budget, hard-truncate a single
   too-long word), a newly generated canonical UUID v4, and `schemaVersion: 2`.
   Assign valid Levels and
   spaced `order` values that produce the intended progression across the whole
   Section, and build every new Slide as the complete Slide object required by
   the Framework `AGENTS.md`. Do not modify the Section landing Slide's title
   or non-instruction content unless the saved instructions explicitly request
   that change.
   Preserve its retained instructions in their relative order and content
   unless the Editor explicitly requests their removal.
6. **Synchronize the manifest and search metadata.** Add, update, or remove only
   the target Section's `content-index.js` Slide entries to match the final files
   exactly. For each new or learner-facing revised Slide, set the Slide
   object's `contentUpdatedAt` in `slide.js` to the current ISO 8601 timestamp,
   generate its normalized lowercase single-word `keywords` under the repository
   Searching rules, and set the index entry's `keywordsUpdatedAt` to that same
   timestamp. Do not add `contentUpdatedAt` to an index entry. Preserve
   timestamps and conforming keywords for unchanged Slides. Ensure every index entry matches
   its Slide's id, UUID, title, level, and order.
7. **Respect the Section boundary.** Changes may include the target
   `section.js`, its child Slide folders and assets, a Section-local `AGENTS.md`
   only when explicitly requested, and the target Section's entries in
   `content-index.js`. Do not change another Category or Section. Do not create
   or regenerate widget JavaScript merely because a widget block is authored;
   leave that to `create-or-update-widget`.
8. **Validate the result.** Check all changed JavaScript files for valid syntax;
   confirm the disk/index relationship and UUID uniqueness; verify that every
   explicitly removed Slide is absent from both disk and the index; verify
   Levels and ordering; ensure referenced local assets exist; ensure every question has
   exactly one correct choice; and confirm no protected health information,
   credentials, secrets, or copyrighted downloads were added. Preserve the
   standard `window.umedAppContent[...]` assignment format.
9. **Report.** Summarize Slides created, revised, retained unchanged, or
   removed; describe the final Level progression; identify generated keyword
   metadata; and note assumptions, source limitations, widgets awaiting
   generation, or decisions needing Editor review.

