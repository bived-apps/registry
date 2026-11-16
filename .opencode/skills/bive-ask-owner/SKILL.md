---
name: bive-ask-owner
description: Ask the human owner for a decision, with a short yes/no/other block, coordinator batching and a durable issue record. Advice is never authorization.
---

# Asking the owner

The owner answers **yes**, **no**, **other**, **advisor** (get advice, then return for a decision), or
**coordinator** (decide only within existing coordinator authority). Use `.bive/templates/question.md`.

## The decision chain: Delegate → Coordinator → Owner

| Role | May decide | Must pass up |
| --- | --- | --- |
| **Delegate** | Implementation choices inside its brief; say which in the report. | Anything outside it, to the coordinator. Stop the blocked part. |
| **Coordinator** | What a rule already answers (cite it), brief clarification and sequencing within authorized scope. | Work or merge authorization, teams, gates, shared-file arbitration, rule changes, irreversible actions and test releases, to the owner. |
| **Owner** | All supervisory decisions. | Nothing is delegated merely by asking for advice. |

An **advisor is not a rung of authority**. It is asked a question about the current worktree, reads relevant files,
returns an answer to the caller and stops. It never writes files/comments/reviews, executes commands, starts agents
or operates workflows. Qualifications, green checks and shared accounts confer no owner powers.

**Bypass**: a missing coordinator or an unanswered blocking question after the stated wait (default one day) may be
raised to the owner. Record the reason in `Path`. Never bypass the owner with advisor advice or an assumed answer.
An answer outside a role's authority is void.

## Transport and GitHub record

The delegate asks its coordinator with the block as an issue comment and reports blocking questions under `Left`.
The coordinator is the only agent role that asks the owner: batch and transmit questions unchanged, merge duplicates,
and cite an existing rule instead of asking where it already decides. An advisor returns advice to its caller;
the caller, never the advisor, records it and asks the owner for any owner-only decision.

Whatever the transport (session, question tool or chat), every workflow question and answer is recorded on the issue:

- Question: one comment with `To` and `Path` filled, posted before or when asking.
- Answer: `Q2 yes`, `Q2 no` or `Q2 other: ...`, attributed to role/model/date. The coordinator mirrors a live owner answer.
- Transmission: `Q2 passed to owner: <reason>`; add the sender and reason to `Path`.
- No answer: `Q2 unanswered after 1 day: asked <role> on <date>, blocks <what>, next <wait | pass to owner>`.
  Record each bypass and repeat status each day while blocked. Silence is not consent.
- Report: list `Q<n>: asked <role>, answered <answer> | unanswered | passed up`, with the comment link.

## Writing and batching

One decision per block; lead with it, give yes/no/other and a recommendation, at most three context lines with links.
Say what is blocked and whether reversible. Default if unanswered is normally **none**; never default an owner-only
decision or an irreversible action. Batch at a part boundary or when blocked, at most five questions.
In an interactive session use fixed choices, recommended option first; otherwise one numbered comment Q1..Qn.

## Quick choices

- Use the client's native question tool with fixed choices: short labels, one-line consequences, and the recommended
  choice first, marked **(Recommended)**. The client adds a custom answer; cancel is allowed.
- Ask one decision per question, never a combined yes/no. A button grants only what its question names.
- For a question about a native app's screen, use that app's own choice dialog when it exposes one, within its consent
  scopes; never ask the owner to retype private app data.
- A non-interactive or preassigned session never opens a form. Missing authorization becomes a blocker in its report.
- A resumed session does not re-ask a settled question; the answer is in the issue or `HANDOFF`.
- With no interactive tool, ask in plain text with a numbered list, say that no buttons were shown, and stop.

## When the owner answers "advisor"

The caller asks a bounded read-only question about the current worktree and records the answer as **advice**.
Bring the proposed decision back to the owner. Asking an advisor does not authorize work or transfer a gate.
Do not revive the retired supervisor routing or load legacy supervisor additions as current authority.

## When the owner answers "coordinator"

Decide only inside the coordinator's existing authority and record the choice and reason. Work/team/gate/merge
authorization, PR closure and test releases cannot be handed over by this shorthand. Ask a plain yes/no instead.
The exceptional coordinator merge opt-in requires its own complete, validated repository/executor/PR/head/base/expiry
grant (`AGENTS.md` › Roles), never a qualification or an advisor answer. No such grant is created by this skill.

## Recording durable decisions

Quote `Owner, <date>: Q2 yes` on the issue. Durable decisions go to `HANDOFF.md` › Decisions; rule changes go to
`AGENTS.md` or the role prompt in a coordinator PR. "Ask again later" is an answer: record it and leave the issue open.
