# Provider fallback

No automatic provider probe by default. Each role lists models in order in `.bive/models.json`; when a call fails
(unreachable, 429, quota), the coordinator retries the same brief with the next model and says so in the report.
When every model of the list failed, a project can offer a provider search: a script (or MCP tool) that tries every
model OpenCode knows with one tiny prompt and prints the ones that answer, fastest first, as a `.bive/models.json`
line. A delegate's work that a reviewer rejects is redone by the next model, not patched by the same one.

## The list per role

`.bive/models.json` is `{ "<role>": ["provider/model", ...] }`, best first; roles are `coordinator` and `delegate`. The
order is the fallback order: when a model fails (unreachable, unavailable, insufficient credit, 429, quota), the next
one takes over. The list is per machine's reality: a model with no credit or no free quota left belongs at the end or
out of the list until it works again. Check that the listed models resolve here before a batch
with `node lib/models-check-cli.ts` (it prints found / alias / missing per role and sends nothing; `--probe` also
sends one tiny prompt per role's first usable model, to reveal a used-up quota or a missing credit; the coordinator
skill `bive-pick-model` says when to run it).

## Least-cost capable order (issue #231; authority: bench `RESULTS.md` › Roles, Names)

Each role takes the **least costly model that is capable of that role**, not its own rank. Capability comes from the
bench (qualification on the latest released version); a model that is merely in the catalog is not available, and an
unknown price is not free. In `.bive/models.json` write the canonical maker/model-version ID; a serving alias lives
only in the ignored machine-local map. A missing credit or quota, or a cost nobody has verified, blocks automatic
selection of that model. A lower-role exception for an unqualified model is the owner's, per role, and appoints nobody
to a higher role. The owner approves the actual candidates and their order before any paid probe or rollout; this
guide invents no prices and makes no live call.

## Proposing a team (issue #223)

Five different things, never confused:

- **listed**: the model is in the catalog.
- **available**: a probe answered today on this machine; a refusal such as "not available in your country", a quota, or
  a missing balance means not available.
- **free**: the catalog price is 0 for input and output.
- **suitable**: qualified for the role on the bench (`RESULTS.md`); a probe is not a qualification.
- **approved**: the owner chose it with buttons, dated.

Two probe kinds and what each proves: a tool-free probe shows the route answers; a one-tool-call probe shows the model
can call a tool (for example, read the first lines of `AGENTS.md`). Neither is qualification. Probes are sent only to
models the owner agreed to probe.

Who does what: the coordinator (or an advisor, as advice only) proposes a team with fixed choices, recommended first,
one decision per question; the owner approves; the approved team is written to `.bive/models.json` with a dated line in
`HANDOFF.md` › Decisions by a coordinator pull request. The retired supervisor role proposes nothing.

A coordinator error (unreachable, 429, quota) never silently changes the assigned model: it reports and follows
"Switching mid-work" below. Delegate fallback (the next model in the delegate list) is unchanged.

A free model is proposed first only when it is available; otherwise propose the current provider's usable model, with
its price when the catalog shows one ("price not shown" when it does not).

## Owner route constraints (issue #262)

An explicit route the owner sets (the `coordinator` allow-list in `.bive/models.json`, a named coordinator model, or any
other owner-named model or route constraint) supersedes any generic fallback or recommendation, including an advisor's.
Fallback applies only where the owner has not fixed the route. Qualification (a published bench pass) is capability
evidence only; it never authorizes work, teams, gates or merges, and an advisor's text is not authorization. This
section concerns models and routes only; dated merge-authorization labels are governed by `docs/REQUIRED-CHECKS.md`.

## Switching mid-work (issue #203)

A delegate that hits a limit after it has started is not restarted from nothing. The coordinator:

1. keeps the worktree as it is and notes what is committed and what is not;
2. continues the delegate's own session on the next model: `opencode run --continue --agent delegate --model
   <next resolved model> "<one short message: what is committed, what is left, the model changed>"`;
3. before the delegate's next commit, sets the worktree's identity to the canonical name of that model:
   `git -C .worktrees/issue-<n> config --worktree user.name "delegate <next canonical model>"`. The earlier commits keep
   the earlier model's name, so `git log` shows which model wrote what;
4. says in the pull request body which models ran, in order.

## Minimum for the coordinator (issue #203, owner 2026-11-12)

A coordinator splits, briefs, reads reports and reviews; a model that fetches invented addresses or asks for its brief
back (a 14B local model did both in the field) wastes the milestone. The minimum is a **published pass** of that model
(name and version) on the bench's `milestone-run` case (<https://github.com/bived-apps/bench>), the same way a model is
qualified. Qualification is capability evidence only: it never authorizes work, teams, gates or merges, and historical
supervisor qualifications grant no authority. Until a pass is published for any model, the owner names the models allowed as coordinator in
`.bive/models.json`: the `coordinator` list is that allow-list. A coordinator that finds itself running on a model that
is not on the list says so to the owner before starting; it does not start.

## Per-machine model aliases

`.bive/models.json` is shared and contains canonical model IDs. If a machine serves one of those models through a
different OpenCode provider ID, keep a local, untracked mapping in `.bive/state/models.local.json`:

```json
{
  "aliases": {
    "anthropic/claude-sonnet-5-5": "claude-agent/sonnet"
  }
}
```

The keys are canonical IDs from `.bive/models.json`; values are the `provider/model` IDs that work on this machine.
`.bive/state/` is git-ignored, so never commit this file; it contains model IDs only, not credentials. If it is absent
or unreadable, use the canonical ID and tell the owner. Keep the canonical model in the worktree-specific Git author
identity (`git config --worktree user.name`) as required by `AGENTS.md`; when useful, report both the canonical and
resolved IDs.

The token counter sends the registry the canonical name, which it finds from this file read backwards. Without a match,
a `claude-agent/` route still gets Anthropic's name: `claude-agent/opus`, `sonnet`, `haiku` and `fable` map to the
versions that provider labels them with (`CLAUDE_AGENT_SHORT` in `.opencode/plugins/token-ratio/lib.ts`), and
`claude-agent/claude-…` maps to `anthropic/claude-…`. When a family gets a new version, update that table.

OpenCode configuration can add or override model IDs under a provider, and `modelID` can change the ID sent to that
provider. That is useful when only the upstream model ID differs. It does not directly alias a canonical
`provider/model` reference to a different OpenCode provider/model pair, so use the local map when provider IDs differ.

Before dispatching a model on a new machine, check that the resolved ID answers:

```bash
opencode run -m <provider/model> "Reply with your model id only."
```

This is a one-model manual check, not an automatic provider search. An unavailable model or an insufficient-funds
error counts as a model error; continue to the next canonical model in `.bive/models.json`, applying its local alias
if present.
