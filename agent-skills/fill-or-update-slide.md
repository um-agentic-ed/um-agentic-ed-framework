# Fill or update slide

## Usage

Invoke this skill after an Editor has created or revised a Slide and filled Agent
instructions into one or more `instructions` blocks in the app's Editor mode
and **saved** the Slide. Retain every `instructions` block unless the Editor
explicitly asks to remove it, and add or revise the other content blocks
requested by those instructions. This prompt also maintains only the target
Slide's search metadata in `content-index.js`.

Follow the slash command with the target, in either form:
- Shorthand: `/build-app fill-or-update-slide <subject>/<category>/<section>/<slide>`.
- Plain language: describe the Slide. Resolve it by searching
  `content-index.js`, never by guessing its path.

If no target was given and none can be inferred from the active editor file,
current selection, or chat context, ask the Editor which Slide to target before
doing anything else.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the [Framework AGENTS.md](../AGENTS.md) in full before proceeding. Also read the
target Section's own `src/content/<subject>/<category>/<section>/AGENTS.md`, if one
exists.

1. **Locate the Slide and retained instructions.** Open
   `src/content/<subject>/<category>/<section>/<slide>/slide.js` and find every
   `content.blocks` entry with `type: "instructions"`, in its existing order.
   If none exists, stop and tell the Editor to add an Instructions block and
   save the Slide in the app first; do not add one directly in `slide.js`.
2. **Use the instructions as the Slide-level brief.** Combine saved instruction
   text in block order with the Slide title, Section guidance, and repository
   requirements. If instructions conflict, follow the later instruction block;
   if they remain materially ambiguous or conflict with AGENTS.md, ask the
   Editor before changing content.
3. **Author learner-facing content.** Add, replace, or revise only the
   non-`instructions` blocks needed to fulfill the brief. Follow the Slide
   schema and educational-content guidance, including trustworthy sources,
   suitable question blocks, safe Markdown, visible attribution for public URL
   images, and approved widget/data-file contracts.
4. **Preserve authoring state and navigation metadata.** Leave every
   `instructions` block exactly as saved, including its relative order and content. Do
   not change the Slide's `id`, `uuid`, `slideSchemaVersion`, `level`, `order`, or `title`.
   Instructions blocks are not rendered in Learner Mode.
5. **Maintain search metadata.** If learner-facing content was added, replaced,
   or revised, set `contentUpdatedAt` in the Slide object in `slide.js` to the
   current ISO 8601 timestamp. Find the matching entry in `content-index.js`;
   do not add `contentUpdatedAt` to that entry or alter its
   hierarchy, id, uuid, title, level, or order. Generate the normalized, lowercase,
   single-word `keywords` list required by the repository's Searching rules,
   replace only that entry's `keywords` list, and set that entry's
   `keywordsUpdatedAt` to the same timestamp. If learner-facing content was
   unchanged, leave both timestamps and keywords unchanged.
6. **Validate the result.** Check that `slide.js` and `content-index.js` are
   valid JavaScript, the target index entry still matches the Slide
   id/uuid/title/level/order, all Framework-required top-level Slide fields remain
   present, the Slide `id` agrees with its folder and registration key, all
   referenced local assets exist, each question has
   exactly one correct choice, and no protected health information,
   credentials, secrets, or copyrighted downloads were added. Preserve the
   standard `window.umedAppContent[...]` assignment format.
7. **Report.** State which Slide was updated, summarize the learner-facing
   changes and generated keywords, and note assumptions or source limitations
   so the Editor can reload and review it in the app.

