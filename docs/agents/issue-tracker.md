# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI.

## Conventions

- Create, read, comment on, label, and close issues with `gh issue`.
- Infer the repository from its GitHub remote.
- Pull requests are not a triage request surface.
- When a skill says to publish to the issue tracker, create a GitHub issue.

## Wayfinding operations

- Maps are issues labelled `wayfinder:map`.
- Decision tickets are child issues labelled `wayfinder:<type>`.
- Claim tickets by assigning them to the active developer.
- Use native GitHub sub-issues and dependencies when available.
- Fall back to task lists and `Blocked by:` body lines otherwise.
- Resolve a ticket with an answer comment, close it, then link its gist from the map.
