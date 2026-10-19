# Issue tracker: Local Markdown

Issues and specs for this workspace live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Project constraints

- **This workspace is not a git repository.** There is no `.git`, no `git remote`, and no local commit history. Anything a GitHub-based workflow would infer from a remote has to be stated explicitly here.
- The only real remotes are upstream GitHub repos, reached through `gh api` or plain HTTP rather than a local clone:
  - `Sui-IB/InternalBeyond-Mobile` — the mobile (PWA) line
  - `Sui-IB/InternalBeyond` — the Windows line
  - `PasleySage/InternalBeyond-Mobile` — our mirror fork of the mobile line
- **Publishing outward requires review.** "Publish to the issue tracker" means writing a local file, nothing more. Drafting anything destined for an upstream repo (issue, PR, comment) happens here first and goes out only on explicit approval — writing to upstream is a public action and is never implied by the local workflow.
