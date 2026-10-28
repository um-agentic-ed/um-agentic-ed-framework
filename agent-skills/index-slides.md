# Index slides

## Usage

Invoke skill `/build-app index-slides` after a batch of Slide authoring, before committing a
substantial content change, or whenever the relationship between `src/content/`
and `content-index.js` is uncertain. It is a maintenance skill that regenerates
an up-to-date `src/content/content-index.js` and supports resetting of Slide
`order` values and Agent-generated `keywords` for all Slides as needed. It does
not create learner-facing content, alter retained instructions, or change the
Subject/Category/Section/Slide hierarchy.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the [Framework AGENTS.md](../AGENTS.md) in full before proceeding. In particular,
follow the Framework's Content Index, Slide metadata, and keyword rules.

1. **Build an inventory.** Read `src/content/content-index.js`, every
   `src/content/<subject>/subject.js`, every `src/content/<subject>/<category>/category.js`, every
   `src/content/<subject>/<category>/<section>/section.js`, and every matching
   `slide.js`, as well as `src/content/app-overview.js`. Ignore
   `_trusted_sources`, assets, widgets, and non-content files for manifest
   discovery. Treat the on-disk folder path and each
   Slide's `id`, `title`, `level`, and `order` as the source for Slide metadata;
   treat each Slide file's `contentUpdatedAt` as authoritative for keyword
   freshness, and treat the existing manifest as the source for
   Subject/Category/Section order.
2. **Validate before changing anything.** Report duplicate ids within a
   Section, malformed JavaScript, invalid Level identifiers, missing overview
   files, a Slide file without a manifest entry, a manifest entry without a
   Slide file, a Subject id that is reserved (`assets`, `app-overview`),
   a missing/malformed/duplicate Slide UUID, a `slideSchemaVersion` that does not
   match the current version declared in Framework `app/schema-contract.js`, any
   mismatch of a Slide's id/uuid/title/level/order, a missing/malformed `appUuid` in the root `app.js`, an
   index `appOverviewUuid` mismatch, an `indexSchemaVersion` that does not match
   the same Framework contract, a missing/malformed/duplicate App/Subject/Category/Section
   landing UUID or a landing UUID mismatch with the index, a UUID duplicated
   anywhere across landing and content Slides, an
   overview title mismatch with the manifest, or any Subject/Category/Section/Slide id
   over 20 characters (see the Framework AGENTS.md's title-to-id rule). Report
   over-length ids as a list for the Editor's attention; do not rename them
   yourself, since that changes on-disk paths and requires the same careful
   move/rewrite handling as the in-app Editor's Section split/move tools. If a
   discrepancy would require deleting a
   file, deleting a Subject/Category/Section/Slide entry, choosing between conflicting
   duplicates, or inventing a missing title, stop and ask the Editor. Otherwise
   repair non-destructively by adding an on-disk Slide missing from the manifest
   or by updating a stale manifest entry from its valid Slide file.
3. **Normalize rank order in one pass.** Preserve the current displayed order:
   sort Subjects, Categories and Sections by their current `order`; within each Section,
   sort Slides first by the kebab-case identifiers derived from
   `app.js:window.umedAppIdentity.slideLevels`, when Levels are enabled, and then
   by current `order`. When Levels are suppressed, sort Slides only by current
   `order`. Assign Subject, Category, Section, and
   Slide orders `10, 20, 30, ...` in that order. Write changed Slide `order`
   values to their individual `slide.js` files and write all resulting metadata
   to `content-index.js`. Do not use Level as a separate order sequence.
4. **Refresh keywords selectively.** For every Slide whose `keywords` is
   missing, empty, non-normalized, contains a phrase, whose `contentUpdatedAt`
   is missing, whose `keywordsUpdatedAt` is missing, or whose
   `contentUpdatedAt` is later than `keywordsUpdatedAt`, regenerate keywords
   from the learner-visible Slide elements specified in AGENTS.md Searching.
   Store every keyword as one deduplicated lowercase word, split on whitespace
   and hyphens with outer punctuation removed, and omit words shorter than
   three characters and trivial/common language consistent with the output of 
   in-app keyword generation as executed by function 
   `src/um-agentic-ed-framework/editor/editor.js:buildSlideKeywords`. Include 
   Slide-title words; exclude retained instructions, code, and Subject/Category/Section 
   landing Slides. Store `contentUpdatedAt` only in each Slide object and store `keywords` 
   and `keywordsUpdatedAt` only in its index entry; never add `contentUpdatedAt` to
   an index entry. For legacy Slides without `contentUpdatedAt`, set the Slide's
   field and the index entry's `keywordsUpdatedAt` to one current ISO 8601
   timestamp as a baseline; do not otherwise alter learner-facing content. 
   Preserve only already-current, conforming lists.
5. **Write consistently.** Update only `content-index.js` and Slide-file metadata
   (`order` and `contentUpdatedAt`) needed for this maintenance task. In the
   index, write navigation metadata plus `keywords` and `keywordsUpdatedAt` as
   defined by the Framework schema. Do not
   reorder JSON/object fields gratuitously, modify widgets, rewrite content
   blocks, or change UUIDs, ids, titles, levels, or retained instructions.
6. **Verify and report.** Re-read the written files and confirm every disk
   Slide has exactly one manifest entry with identical id/title/level/order;
   all ranks use the normalized spacing; all landing and content UUIDs are
   canonical and globally unique; `appOverviewUuid` and hierarchy UUIDs match
   their landing files; and every Slide has a deduplicated lowercase single-word
   keyword list whose index `keywordsUpdatedAt` is at least as recent as the authoritative Slide
   `contentUpdatedAt`. Report
   the validation status, count of repaired entries, count of ranks changed,
   and Slides whose keywords were generated or refreshed.

