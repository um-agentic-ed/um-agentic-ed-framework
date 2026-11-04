# Fill app outline

## Usage

Invoke this skill after an Editor has created or revised `app-outline.xlsx`.
It is the first stage of the outline workflow: it instantiates the outline as a
content tree, and the Editor later invokes `generate-content` on chosen
Categories, Sections, or Slides to write detailed content.

Create any missing Subjects, Categories, Sections, and Slides listed in the
app outline that are not already present in the app. Create the required content
folders, including landing slides for Subjects, Categories, and Sections, and
populate the landing slides with brief summary information. Transfer outline text
that is guidance for an Agent into `instructions` blocks (see below). Do not
remove any existing content, including tree levels present in the app but absent
from the outline, unless the user brief explicitly requests otherwise.

Authorization boundaries:
- **Create** content Slides that are explicitly listed in the outline. Never
  invent Slides the outline does not list.
- Do NOT **generate** content: leave created content Slides with no Blocks other
  than transferred `instructions` blocks. Detailed content generation belongs to
  `generate-content`, so the Editor controls when and where it runs.
- Only if the brief explicitly authorizes continued generation after filling the
  outline may you then generate content, in the scopes the brief names, following
  `generate-content.md`. Otherwise report that `generate-content` is the next step.

Follow the slash command with the target as `/build-app fill-app-outline`.

This action requires `app-outline.xlsx`; if the file does not exist or is empty, do
nothing and report the expected inputs to the user. The outline's columns are not
fixed: it may include any of Subject, Category, Section, Slide, Level,
instructions, or other descriptive columns, and may stop at any tree level.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the [Framework AGENTS.md](../AGENTS.md) 
in full before proceeding. 

1. **Locate and read the app outline.** Resolve the Editor's intended app 
   outline in `app-outline.xlsx`; if it is unclear, ask for clarification before 
   proceeding. Interpret the columns present. Take Subject, Category, Section, and
   (when present) Slide entries as titles for the tree, which you should use
   while matching the outline to existing content by title and position.
2. **Plan and author missing tree levels.** Create or revise as many missing
   content tree folders and landing Slides as needed to fill out the outline.
   Landing slides get brief summary information only.
3. **Create outline-listed content Slides.** For each Slide the outline lists
   under a Section that is not already in the app:
   - Create its folder and `slide.js` with the outline title (Sentence case), a
     unique id by the Framework title-to-id rule, a newly generated UUID v4, the
     current `slideSchemaVersion` from Framework `app/schema-contract.js`, a valid
     Level (from the outline if given and valid, otherwise the first configured
     Level, or none when Levels are suppressed), and spaced `order` values
     following the outline's order.
   - Add the matching `content-index.js` entry, deriving `keywords` from the
     title only since there is no content yet.
   - Leave existing Slides untouched, including their content and instructions.
   - Place outline text that is guidance rather than learner-facing text (e.g.,
     descriptions, objectives, instructions columns) in an `instructions` block
     on that Slide; likewise place Category- or Section-level guidance in an
     `instructions` block on its landing Slide. Never overwrite or remove existing
     `instructions` blocks; add a new block when the text differs.
   - Do not add `markdown`, `image`, `question`, `widget`, or other content Blocks.
4. **Validate the result.** Check all changed JavaScript files for valid syntax;
   confirm the disk/index relationship and UUID uniqueness; verify
   Levels and ordering; confirm no protected health information,
   credentials, secrets, or copyrighted downloads were added. Preserve the
   standard `window.umedAppContent[...]` assignment format.
5. **Report.** Tree levels, landing slides, and content Slides created or already
   present (or removed if the brief specifically authorized it), outline text
   transferred into `instructions` blocks, and outline entries you could not place.
   Remind the Editor that created Slides are intentionally empty and that
   `generate-content` populates them after any further instructions or trusted
   sources are added.

