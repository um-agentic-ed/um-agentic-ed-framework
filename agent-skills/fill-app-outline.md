# Fill app outline

## Usage

Invoke this skill after an Editor has created or revised `app-outline.xlsx`.
Create any missing Subjects, Categories, and Sections you find in the app outline  
that are not already present in the app. You will create the required contents folders 
including creating landing slides for Subjects, Categories, and Sections and populating  
them with brief summary information. Do NOT create any new content Slides within the 
Sections, which are built later as invidual Section build tasks. Do not remove any
existing content, including Subjects, Categories, or Sections found in the app
but absent from the outline, unless the user brief explicitly requests otherwise.

Follow the slash command with the target as `/build-app fill-app-outline`.

This actions requires `app-outline.xlsx` with Subjects (if in use), Categories,
and Sections to create; if the file does not exist or is empty, do nothing
as report expected inputs to the user.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the [Framework AGENTS.md](../AGENTS.md) 
in full before proceeding. 

1. **Locate and read the app outline.** Resolve the Editor's intended app 
   outline in `app-outline.xlsx`; if it is unclear, ask for clarification before 
   proceeding. Take  Subject, Category, and Subject entries in `app-outline.xlsx`
   as titles for hierarchical landing slides, which you should use while matching
   the outline file to existing content.
2. **Plan and author missing Subject, Category and Section landing slides.** 
   Create or revise as many missing content tree folders and landing Slides 
   as needed to fill out the app content outline. Do NOT create content Slides.
3. **Validate the result.** Check all changed JavaScript files for valid syntax;
   confirm the disk/index relationship and UUID uniqueness; verify
   Levels and ordering; confirm no protected health information,
   credentials, secrets, or copyrighted downloads were added. Preserve the
   standard `window.umedAppContent[...]` assignment format.
4. **Report.** Tree levels and landing slides created or already present, 
   or removed if the user's brief specifically authorized you to remove content.

