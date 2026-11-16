# One GitHub App for the agents (owner decision, 2026-11-14; issue #235)

Today every role acts under the owner's GitHub account, so GitHub cannot tell the owner from an agent (#130). The owner
chose **one App for all agents**, not one per role. It separates agents from the owner; it does not separate the
coordinator from a delegate (that stays with the guard, the role file and signed comments).

## What exists (2026-11-14)

- App slug `bived-agents`, App ID 5761164 (public), owned by bived-apps, installed on bived-apps/bive only.
- Permissions: contents, issues, pull requests (write); actions, checks, metadata (read); no events.
- The private key is kept in the owner's password manager, nowhere on disk.
- `main` ruleset has Restrict updates and the Repository admin role as the only bypass, for pull requests only; no App
  bypass anywhere.

## Tests passed

- An agent comment shows as [`bived-agents[bot]`](https://github.com/apps/bived-agents) (type Bot; an App has no
  user profile, so `github.com/bived-agents[bot]` is not a page).
- A dated label applied with the App token (by the owner, on scratch PR #300) was refused by bive-merge-gate.
- The owner's own label passes (every merged PR).

## Tokens for a session (option A, #299)

The owner runs a private helper outside every repository. It unlocks the password manager, mints a one-hour token for
bived-apps/bive, and starts `opencode --standalone` with `GH_TOKEN`. It never puts the key or the unlocked vault session
in the environment.

Limits: the token lasts one hour; `gh` uses the App but `git push` keeps its existing credentials (#236); OpenCode
Desktop's background service still uses the owner's account (options C + D, below).

## Tokens for every session (options C + D, #299)

Owner decision, 2026-11-15: the broker is started by hand after each login, **every Desktop session acts as the App**,
the owner's own terminals and browser keep the owner's account, and everything fails closed when the broker is down.
The helper lives in the owner's private repository (`jcherfils/bive-token-broker`); nothing of it is in a Bive
repository.

**C, the local broker.** `broker start` unlocks the password manager once, hands the key to the broker through a pipe
(never an argument, never an environment variable, never on disk), locks the vault again and detaches. The broker keeps
the key in memory and serves installation tokens for bived-apps/bive on a Unix socket in the owner's home directory
(mode 0600, in a directory of mode 0700). A token lasts one hour; the broker renews it five minutes before it expires,
so a session that runs for days keeps working. `broker stop` erases the key and exits; a reboot stops it too. It
answers nothing but a token, a status and the stop, and never returns the key. Accepted risk: any process of the
owner's user can ask it for App tokens (that is the intended outcome), never for the key.

**Clients.** `bive-token` prints a token, `bive-token git-credential` is a git credential helper (username
`x-access-token`), and the `gh` shim runs the real `gh` with that token. With the broker down they exit 1 with
`token broker not running`; they never fall back to the owner's login.

**Several accounts, one broker (#314).** The App's key serves every account the App is installed on: the broker holds a
list of targets and mints one token per installation, each limited to its own repositories. The list is
`~/.bive/targets.json` (mode 0600) or the variable `BIVE_TARGETS="bive=bived-apps/bive,fifoo=jcherfils/FiFoo"`;
`BIVE_ORG` and `BIVE_REPOS` still serve a single account. The client asks for the right one by itself: `gh --repo`
names it, otherwise the repository of the working directory's git remote decides, `BIVE_TARGET` overrides,
`bive-token --target` names one, and git's credential request carries the path (`credential.useHttpPath`, set by the
Desktop setup). A target the broker does not know is refused; it never answers from another account. The App must be
installed on each account.

**D, the Desktop service.** `bive-desktop setup` points the OpenCode background service at the shims (`PATH` first,
and the git credential helper for `https://github.com`, preceded by an empty helper value that resets the owner's own
keychain helper) and restarts it; `bive-desktop undo` removes them. Run it from the owner's own terminal: it restarts
the service the sessions run in. Every Desktop session then acts as `bived-agents[bot]`, and a `git push` from a
Desktop session is pushed by the App.

Not yet proven live: the owner's own tests (a Desktop session comments as the App, a push shows the App as the
pusher, a session longer than an hour keeps working, and with the broker stopped `gh` and `git push` fail with the
broker's message).


## Revoke, rotate, stop

- **Rotate**: generate a new key on the App page, store it, delete the old key on the App page.
- **Revoke at once**: delete every key or suspend/uninstall the App on the organisation's installed Apps page.
- **Stop all agent activity**: uninstall the App to stop App-token sessions; stop the OpenCode service and sessions
  (`opencode service stop`) to stop the others; `broker stop` to end the broker (the key leaves its memory).

None of these needs an agent.

## What it gives

- Every agent action (push, comment, pull request, label) shows as `<slug>[bot]`, `actor.type: "Bot"`.
- The merge gate already refuses a dated label or an override label applied by a Bot or an App
  (`docs/REQUIRED-CHECKS.md` › Agent identity): with the App in place, only the owner's own account can authorize a
  merge, for real.
- The owner's account is used for the dated label and the merge only.

## Owner checklist (the owner does each step; no agent creates or installs the App)

1. Create a GitHub App owned by the organization: name of your choice, no webhook, no user authorization.
2. Repository permissions, nothing else: contents write, pull requests write, issues write, checks read, actions read,
   metadata read. **Not**: administration, workflows, secrets, members.
3. Install it on the repositories the agents work in (Bive first), not on all repositories.
4. Rulesets: keep `main` restricted to the owner (bypass: repository admin role only); on `bived` and `milestone/*`,
   pull requests required, merge commits only. Do not give the App any bypass.
5. Generate one private key. Keep it on the owner's machine outside every repository (for example in the system
   keychain), never in a worktree, `.bive/state/` or an environment file an agent can read.
6. Give agents short-lived installation tokens only: the owner (or a small owner-run helper outside the repository)
   mints a token per session and passes it as `GH_TOKEN`, or starts the broker that renews them (options C + D above).
   Tokens expire within an hour; the key itself is never handed to an agent.
7. Test once: an agent comment shows as the App; an agent-applied dated label is refused by the gate; the owner's label
   passes. With the broker: a Desktop session comments as the App, a `git push` shows the App as the pusher, and with
   the broker stopped `gh` and `git push` fail with the broker's message.

## Limits

- Coordinator and delegate share the App: the gate cannot tell them apart. Separation stays with the guard, the role
  file, worktree paths and the signed `— <role> <provider/model>` comments.
- A token handed to a session can do anything the App's permissions allow until it expires.
- Per-role Apps (#236–#238, #240) are not planned under this decision; they remain open for a later owner decision.
