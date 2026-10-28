# Set app identity

## Usage

Invoke skill `/build-app set-app-identity` right after cloning `um-agentic-ed-parent` to start
a new App, or later to change the App's title, discipline, learner/user level, chatbot,
Subject usage, or colors. It normally edits the Parent root files `app.js` and
`app.css`; changing Subject usage may also require a coordinated content-index
and Subject-folder migration. Changing only the App title or name does not.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the
[Framework AGENTS.md](../AGENTS.md) in full
before proceeding. Together they are authoritative for App-specific identity,
branding, content structure, and editing boundaries.

1. **Read the current files.** Read `app.js` and `app.css` in the Parent root.
   Keep their comments and structure; change only the values.
2. **Collect values.** Use values given in the prompt. For any that are 
   missing, ask the Editor one question at a time, and offer the current 
   value as the default:
   - `appTitle`: the human-readable title, used for both the app header and 
     the browser tab. Keep it short enough to fit in the header.
   - `discipline`: the subject area Learners study, phrased to complete "I am 
     a learner in ...", e.g., "organic chemistry".
   - `userLevel`: the typical Learner/User, as an adjective phrase that fits "I 
     am a ___ learner/user", e.g., "high school", "undergraduate", "post-graduate".
   - `chatbotUrl`: the web address of the AI chatbot opened when a Learner asks 
     about a Slide, e.g., `https://chatgpt.com/` or `https://claude.ai/`. Ask which 
     chatbot the App's Learners use (an institutional one, if any). It must start 
     with `https://` (or `http://`); an empty string means no chatbot is opened.
   - `appName`: suggest a kebab-case name derived from the title. Normalize 
     any provided value to lowercase `a-z`, `0-9` and hyphens only.
   - `subjectsEnabled`: whether Subjects are visible and editable. Offer the
     current value as the default. Omitted values mean `true` for compatibility.
   - `slideLevels`: the requested display names for Slide navigation, in their
     progression order. Each name becomes a kebab-case `level` identifier in
     Slide files. Use an empty array to suppress Slide Levels.
   - Optional colors for `app.css` (`--umed-brand-bg`, `--umed-brand-text`, 
     `--umed-brand-hover-bg`, `--umed-brand-border`, `--umed-brand-accent`). 
     If the Editor names a color scheme, derive all five values from it; keep 
     the text color clearly readable on the background (WCAG AA contrast, at 
     least 4.5:1), and make the hover color a slightly lighter or darker 
     shade of the background. If the Editor expresses no preference, leave 
     the colors unchanged.
   - `allowedEditorNames`: an array of unique recognized Editor names. Only these names  
     are accepted as valid entries to enable Editor Mode and can be recorded in the 
     `owner` field of the `APP_LOCK.js` file (in addition to the name `AGENT` used
     by Agents acting outside of the app). Any valid string can be used, but 
     lowercase strings with no spaces, such as email address prefixes, are 
     recommended. Values are a convenience to help keep Editor work organized 
     and must not be considered a secure authentication or authorization mechanism.
     If the array is empty, only Agent editing is supported. 
3. **Set the UUID.**
   - If `appUuid` is still the template value 
     `46210d14-c104-4f99-a394-34d32e81ac51`, generate a new random UUID v4 
     (e.g., PowerShell `[guid]::NewGuid()` or Python `uuid.uuid4()`) and 
     write it. Never invent a UUID by hand.
   - Otherwise keep the existing `appUuid`. Only replace it if the Editor 
     explicitly asks for a new one, and first warn that doing so detaches 
     all Learner notes already saved in browsers and makes previously 
     exported notes files unloadable, then ask for confirmation.
4. **Coordinate suppressed-Subject content.** When `subjectsEnabled` is false,
   the App must have exactly one Subject whose id and title are both
   `app-subject`, and its `subject.js` must have an empty `content.blocks`
   array. Preserve its UUID and all descendant UUIDs.
   - If disabling Subjects for an App with more than one Subject, stop and ask
     the Editor how the content should be consolidated; never discard or merge
     Subjects implicitly.
   - If the sole Subject needs renaming, rename its directory, update its entry
     in `src/content/content-index.js`, update the registration keys in every
     descendant content file, and preserve all Category/Section/Slide ids.
   - Changing `appName` never changes the fixed `app-subject` id or title and
     requires no content migration.
   - When re-enabling Subjects, retain the structural Subject as an ordinary
     visible Subject; its title may then be changed through normal content work.
5. **Write the identity files.** Update `app.js` and, if colors changed, `app.css`.
   Values must be valid JavaScript strings or CSS colors, and must not 
   contain quotes, backslashes or line breaks that break the syntax.
6. **Validate.**
   - `appUuid` matches a canonical UUID v4 pattern.
   - `appName` matches `^[a-z0-9]+(-[a-z0-9]+)*$`.
   - `appTitle`, `discipline` and `userLevel` are non-empty.
   - `chatbotUrl` is either an empty string or starts with `https://` or `http://`.
   - `subjectsEnabled` is a boolean; when false, validate the complete hidden-
     Subject invariant and confirm every route-bearing content key uses its id.
   - `slideLevels` is an array of zero or more unique, trimmed, nonempty strings
     whose derived kebab-case identifiers are also unique.
   - `allowedEditorNames` is an array containing only unique, trimmed, nonempty 
      strings. An empty array is allowed and disables Editor Mode.
   - `app.js` still only assigns `window.umedAppIdentity` and parses 
     (e.g., `node --check app.js`).
   - If colors changed, each edited custom property is a valid CSS color and
     brand text retains at least WCAG AA 4.5:1 contrast against the brand
     background.
7. **Report** the final values in a short summary, and remind the Editor
   that `appUuid` must never change after Learners start using the App.
   Do not set any custom app styling classes as described in `app.css` unless the  
   brief requested them, but tell the user that they may edit `app.css` to add 
   custom styling classes that can be used in markdown fields using syntax 
   `{.my-class target text}`, but that they should first review the styling classes 
   that are already available in `src/um-agentic-ed-framework/styles/markdown-styles.css` 
   before adding new ones.

Do not edit Framework files or the HTML entrypoint. Do not edit content files
unless a requested Subject-usage or suppressed-App-name change requires the
coordinated migration above.

