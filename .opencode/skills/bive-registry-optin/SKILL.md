---
name: bive-registry-optin
description: At install, ask the owner once whether this project joins Bive's public anonymous registry, and create the id only on an explicit yes. Use during the install of Bive in a new or existing project, or when the owner asks to join or leave the registry.
---

# Joining the registry: ask once, create the id only on a yes

The registry (`docs/REGISTRY.md`) is opt-in. The file `.bive/registry-id` is the switch: a committed id means the
project reports from every clone, so **never create, copy or commit an id without a yes from the owner**.

## At install

1. Ask the owner one question, in the format of `.bive/templates/question.md` (skill `bive-ask-owner`), with the
   install's other questions in the same message:
   - **Decision needed**: report anonymously to the public registry?
   - **Context**: it sends a random id, token counts per model, violation counts and the project's size rounded to
     two digits; no name, path, text or date (`docs/REGISTRY.md`).
   - **Recommended**: Yes. **Reversible**: yes (delete the file or set `BIVE_REGISTRY=off`). **Default if
     unanswered**: none: write nothing.
2. **Yes**: create a fresh random id and write it alone, with a newline, to `.bive/registry-id`:
   `node -e "console.log(crypto.randomUUID())" > .bive/registry-id` (shell redirection inside the worktree is fine).
   Commit it with the install. Never reuse an id from another project or from this template.
3. **No, other, or no answer**: write nothing. Say in the install report that the registry is off and how to turn it
   on later (`docs/REGISTRY.md`).
4. Record the answer on the install issue or pull request, with the date.

## Later, when the owner asks

- **Join**: step 2, in a pull request.
- **Leave**: delete `.bive/registry-id` in a pull request; tell the owner that `BIVE_REGISTRY=off` stops reporting at
  once on one machine.

## Never

- Generate the id "to be ready" before the answer.
- Set `BIVE_REGISTRY=on` for the owner.
- Put the id in a message, a comment or a report: it is committed, so the file is the only place.
