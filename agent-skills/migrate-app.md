# Migrate app

## Usage

Invoke `/migrate-app` after updating the Framework submodule when the new
Framework version declares breaking changes that require updates to Parent App
files or content schemas. This entrypoint authorizes only the migrations
documented for the installed Framework version; it does not authorize unrelated
App editing or Framework development.

## Instructions for the agent

Read the [Parent AGENTS.md](../../../AGENTS.md) and the
[Framework AGENTS.md](../AGENTS.md) in full before proceeding. The Framework's
`# App version migration` section is the authoritative list of released
migrations and their required order.

1. Determine which released migration instructions, if any, apply to the App.
2. If the Framework lists no applicable migration, make no changes and report
   that the installed alpha Framework currently has no released App migration.
3. Never infer a migration merely from differences observed in current files.
   Apply only an explicitly documented migration and stay within its stated
   files, versions, checks, and compatibility requirements.
4. When migrations are added in the future, apply them in documented order,
   preserve App-specific content and identity, validate each completed version
   boundary, and report every changed file and resulting schema version.

## Current migration status

There are no prior released Framework versions and no App migrations to perform.
This file is intentionally an operational shell until the Framework
`# App version migration` section defines the first released migration.
