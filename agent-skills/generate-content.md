# Generate educational content

## Usage

Invoke this skill after an Editor has added Agent instructions to one or more
`instructions` blocks in app Editor Mode and **saved** them. Retain every
`instructions` block unless the Editor explicitly asks to remove it. The skill
can generate or revise content within one Category, one Section, or one Slide.
It may organize or create child Slides when the selected scope permits, but may
remove a Slide only when the saved instructions explicitly request removal.

Follow the slash command with the target in either form:

- Shorthand: `/build-app generate-content <subject>/<category>[/<section>[/<slide>]]`.
- Plain language: describe the target Category, Section, or Slide. Resolve it by
  searching `src/content/content-index.js`; never guess its path.

If no target was given and none can be inferred from the active editor file,
current selection, or chat context, ask the Editor which content to target
before doing anything else. The resolved target determines the authorized
scope; do not read or change educational content outside it.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the
[Framework AGENTS.md](../AGENTS.md) in full before proceeding. Read the relevant
files in the target Category's `_trusted_sources` folder. Within every target
Section, also read its `AGENTS.md`, if present, and relevant files in its own
`_trusted_sources` folder. Category sources apply throughout the Category;
Section sources apply only to their own Section and never to a sister Section.

1. **Resolve the target and scope.** Locate the exact target in
   `src/content/content-index.js` and classify it by path depth:
   - A Category target authorizes work in that Category and its descendants.
     Its saved Category instructions govern Category-wide work, including the
     creation, organization, or revision of Sections and their Slides.
   - A Section target authorizes work only in that Section and its child Slides.
     Its saved Section instructions govern the Section-wide work.
   - A Slide target authorizes work only in that Slide and its matching search
     metadata. Its saved Slide instructions govern the work.
2. **Locate the applicable retained instructions.** Read every
   `content.blocks` entry with `type: "instructions"` in its saved order:
   - For a Category, inspect its `category.js`.
   - For a Section, inspect its `section.js`.
   - For a Slide, inspect its `slide.js`.
   If the target has no applicable instructions, stop and tell the Editor where
   to add and save an Instructions block; do not add one directly. Retain every
   instruction block exactly as saved, including its content and relative
   position, unless the Editor explicitly requests its removal.
3. **Inventory only the authorized scope.** For a Category or Section, read the
   applicable child landing Slides, child `slide.js` files, and matching index
   entries. For a Slide, read that Slide and its matching index entry. Assess
   existing coverage, duplication, Levels, ordering, learner progression,
   assets, relevant sources, and Slide-level retained instructions. A
   Existing Section- and Slide-level instructions supplement a Category brief
   when the Agent modifies their respective descendants. Existing Slide-level
   instructions supplement a Section brief when that Slide is revised. Lower-level
   instructions do not expand the selected scope, and Category instructions do
   not apply when the selected target is a Section or Slide.
4. **Apply the saved brief.** Combine applicable instruction text in block order
   with the target title, local guidance, trusted sources applicable to each
   Slide, existing lower-level instructions, and repository requirements. Later instruction
   blocks take precedence over earlier ones at the same scope. Repository
   instructions remain authoritative. Ask the Editor before changing content
   if a material ambiguity or unresolved conflict remains.
5. **Author learner-facing content appropriate to the scope.**
   - For a Category, create, organize, or revise child Sections and Slides as
     its brief requires. Respect retained instructions on existing Sections and
     Slides when modifying them.
   - For a Section, create, organize, or revise as many child Slides as its
     brief requires. Build a coherent progression within and across
     `foundations`, `core-learning`, and `advanced-topics`, using only the
     Levels needed.
   - For a Slide, add, replace, or revise only the non-`instructions` blocks
     needed to fulfill its brief. Do not change its title, id, UUID, schema
     version, Level, order, folder, or registration key.
   In every scope, follow the Slide schema and educational guidance for
   trustworthy sources, digestible Slides, suitable questions, GPT follow-ups,
   safe Markdown, image attribution, and approved widget/data-file contracts.
   Do not remove an existing Section or Slide unless the applicable saved brief
   explicitly requires it; ask if deletion intent is ambiguous.
6. **Preserve identity and assign metadata.** Preserve each retained Slide's
   UUID and `slideSchemaVersion`. A title, Level, or order change does not imply
   an id/path change. Rename an id/path only when the applicable saved brief
   explicitly requires it; preserve the UUID and coordinate the
   folder, registration key, index entry, and local asset or widget references.
   Give each new Slide a unique id following the repository's 20-character
   title-to-id rule, a newly generated canonical UUID v4, and the current
   `slideSchemaVersion` from Framework `app/schema-contract.js`. Assign valid
   Levels and spaced order values across the Section. Give each new Section its
   complete folder, landing Slide, current schema version, newly generated UUID,
   and matching index entry. Do not change landing Slide learner-facing content
   unless the applicable saved brief explicitly requests it.
7. **Synchronize index and search metadata.** Make only the target scope's
   corresponding changes in `content-index.js`. For each new Slide or Slide
   whose title or learner-facing content changed, set `contentUpdatedAt` in
   `slide.js` to the current ISO 8601 timestamp, regenerate its normalized
   lowercase single-word `keywords`, and set the index entry's
   `keywordsUpdatedAt` to the same timestamp. Never add `contentUpdatedAt` to an
   index entry. Preserve conforming keywords and timestamps for unchanged
   Slides. Ensure every entry matches its Slide's id, UUID, title, Level, and
   order.
8. **Respect scope and task boundaries.** Category work may touch its
   `category.js`, Category `_trusted_sources` declarations, descendants, and
   corresponding index branch; Section work may touch
   only its `section.js`, child Slide folders and assets, and corresponding
   index entry; Slide work may touch only its folder and matching index entry.
   Change a Section-local `AGENTS.md` only when explicitly requested. Do not
   create or regenerate widget JavaScript merely because a widget block is
   authored; use `create-widget` for that task.
9. **Validate the result.** Check changed JavaScript syntax; confirm disk/index
   correspondence, schema versions, UUID uniqueness, folder and registration
   keys, Levels, and ordering; ensure removed Slides are absent from both disk
   and index; verify referenced local assets exist and every question has
   exactly one correct choice; and screen additions for protected health
   information, credentials, secrets, unsafe code, and copyrighted downloads.
   Preserve the standard `window.umedAppContent[...]` assignment format.
10. **Report.** Identify the resolved scope and summarize Slides created,
    revised, retained unchanged, or removed. Describe the final Level
    progression when working above one Slide, note regenerated keyword metadata,
    and call out assumptions, source limitations, widgets awaiting generation,
    or decisions needing Editor review.
