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
[Framework AGENTS.md](../AGENTS.md) in full before proceeding. Category trusted
sources apply throughout the Category; Section sources apply only to their own
Section and never to a sister Section. Resolve all applicable trusted-source
entries as required below before reading them or generating content.

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
3. **Preflight every applicable trusted source before content generation.**
   Inspect every `trustedSources.files` entry that applies to the target: the
   parent Category entries for Category, Section, and Slide targets; the target
   Section entries for a Section or Slide target; and every child Section's own
   entries when a Category target may modify that Section. Normalize legacy
   filename-string entries as `{ file, url: "", label: "" }` when interpreting
   them, but do not rewrite them merely for normalization.
   - If `file` is nonempty and that exact file exists in the landing scope's
     `_trusted_sources` folder, the entry is resolved. Use that local file as
     context regardless of whether `url` is blank, invalid, unreachable, or
     points somewhere else.
   - If `file` is blank, or names a missing file, inspect `url`. It must be a
     public `https://` or `http://` URL to remain resolvable. Reject localhost,
     loopback, link-local, private-network, and cloud-metadata destinations,
     including destinations reached after redirects. Never put credentials,
     tokens, PHI, or other sensitive values in a URL.
   - Download only when the URL resolves directly to a file suitable as Agent
     context. Treat a recognizable safe document/data/image filename in the URL
     path, a safe attachment filename in `Content-Disposition`, or an
     unambiguous non-HTML file content type as evidence of a direct file. Do not
     download a normal HTML web page, database record, search result, login page,
     or other non-file resource into `_trusted_sources`; a URL-only non-file
     entry may remain a link/reference if it is valid and reachable, but it is
     not local file context. A non-file URL cannot resolve an entry whose
     nonempty `file` declaration is missing.
   - Reject executables, installers, scripts with unsafe execution implications,
     malformed responses, authentication/error pages, and files that violate
     repository security rules. Confirm that the response type, extension, and
     contents are mutually plausible. Derive a safe filename from
     `Content-Disposition` or the final URL path, preserve a meaningful supported
     extension, and never silently overwrite a different existing file. Ask the
     Editor before accepting an unexpectedly large or ambiguous download.
   - Stage candidate downloads in a temporary location outside the project.
     Validate the complete applicable source set before writing any staged file,
     changing any `trustedSources` declaration, or modifying generated content.
     If every entry resolves, move staged files into their applicable
     `_trusted_sources` folders and set each downloaded entry's `file` to its
     final filename while preserving `url` and `label`; then read the applicable
     local files as context. If any entry remains unresolved, discard staged
     downloads, report every problem together, and make no project changes.
     Ask whether the Editor wants to fix the sources or explicitly continue
     without the unresolved entries. Only after that choice may the Agent commit
     the resolvable downloads and proceed; continuing never authorizes use of an
     unresolved source as factual support.
4. **Inventory only the authorized scope.** For a Category or Section, read the
   applicable child landing Slides, child `slide.js` files, and matching index
   entries. For a Slide, read that Slide and its matching index entry. Assess
   existing coverage, duplication, Levels, ordering, learner progression,
   assets, relevant sources, and Slide-level retained instructions. Existing
   Section- and Slide-level instructions supplement a Category brief
   when the Agent modifies their respective descendants. Existing Slide-level
   instructions supplement a Section brief when that Slide is revised. Lower-level
   instructions do not expand the selected scope, and Category instructions do
   not apply when the selected target is a Section or Slide.
5. **Apply the saved brief.** Combine applicable instruction text in block order
   with the target title, local guidance, trusted sources applicable to each
   Slide, existing lower-level instructions, and repository requirements. Later instruction
   blocks take precedence over earlier ones at the same scope. Repository
   instructions remain authoritative. Ask the Editor before changing content
   if a material ambiguity or unresolved conflict remains.
6. **Author learner-facing content appropriate to the scope.**
   - For a Category, create, organize, or revise child Sections and Slides as
     its brief requires. Respect retained instructions on existing Sections and
     Slides when modifying them.
   - For a Section, create, organize, or revise as many child Slides as its
     brief requires. Build a coherent progression within and across the app's slide
     levels when they are not suppressed in `app.js`, using only the Levels needed.
   - For a Slide, add, replace, or revise only the non-`instructions` blocks
     needed to fulfill its brief. Do not change its title, id, UUID, schema
     version, Level, order, folder, or registration key.
   In every scope, follow the Slide schema and educational guidance for
   trustworthy sources, digestible Slides, suitable questions, GPT follow-ups,
   safe Markdown, image attribution, and approved widget/data-file contracts.
   Do not remove an existing Section or Slide unless the applicable saved brief
   explicitly requires it; ask if deletion intent is ambiguous.
7. **Preserve identity and assign metadata.** Preserve each retained Slide's
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
8. **Synchronize index and search metadata.** Make only the target scope's
   corresponding changes in `content-index.js`. For each new Slide or Slide
   whose title or learner-facing content changed, set `contentUpdatedAt` in
   `slide.js` to the current ISO 8601 timestamp, regenerate its normalized
   lowercase single-word `keywords`, and set the index entry's
   `keywordsUpdatedAt` to the same timestamp. Never add `contentUpdatedAt` to an
   index entry. Preserve conforming keywords and timestamps for unchanged
   Slides. Ensure every entry matches its Slide's id, UUID, title, Level, and
   order.
9. **Respect scope and task boundaries.** Category work may touch its
   `category.js`, Category `_trusted_sources` declarations, descendants, and
   corresponding index branch; Section work may touch
   only its `section.js`, child Slide folders and assets, and corresponding
   index entry; Slide work may touch only its folder and matching index entry.
   Trusted-source preflight is a narrow exception: for any target depth, it may
   write validated downloads to applicable Category or Section
   `_trusted_sources` folders and update only the matching entries' `file`
   fields in those landing files. It must not alter other landing-slide content.
   Change a Section-local `AGENTS.md` only when explicitly requested. Do not
   create or regenerate widget JavaScript merely because a widget block is
   authored; use `create-widget` for that task.
10. **Validate the result.** Check changed JavaScript syntax; confirm disk/index
   correspondence, schema versions, UUID uniqueness, folder and registration
   keys, Levels, and ordering; ensure removed Slides are absent from both disk
   and index; verify referenced local assets exist and every question has
   exactly one correct choice; and screen additions for protected health
   information, credentials, secrets, unsafe code, and copyrighted downloads.
   Preserve the standard `window.umedAppContent[...]` assignment format.
11. **Report.** Identify the resolved scope and summarize Slides created,
    revised, retained unchanged, or removed. Describe the final Level
    progression when working above one Slide, note regenerated keyword metadata,
    identify trusted sources downloaded or left as URL-only references, and call
    out assumptions, unresolved or unused sources, source limitations, widgets
    awaiting generation, or decisions needing Editor review.
