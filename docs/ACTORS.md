# Actors (issue #237)

GitHub shows every agent action as [`bived-agents[bot]`](https://github.com/apps/bived-agents) with
`actor.type: "Bot"`, and the owner's login for the owner; the role is proven by the Git author
(`coordinator <provider/model>` / `delegate <provider/model>`) and the signed comment suffix
(`— <role> <provider/model>`). A session started without the App token acts as the owner's login, so its comments
must still be signed.

## End to end

| Step | Who acts | GitHub actor | Proof of role |
| --- | --- | --- | --- |
| Claim the issue | coordinator | `bived-agents[bot]` (App) or owner | signed comment |
| Implement and push the branch | delegate | git credentials (owner, #236) | `delegate <provider/model>` |
| Open the pull request | coordinator only, never the delegate | `bived-agents[bot]` (App) or owner | delegate author |
| Review and hand over | coordinator | `bived-agents[bot]` (App) or owner | Ready to merge comment; no App approval |
| Apply the dated label | owner only | the owner's login | the gate refuses an App label |
| Merge | owner only | the owner's login | the GitHub merge commit |
| Close the issue | coordinator | `bived-agents[bot]` (App) or owner | merge commit reachable from base |
| An advisor answers | advisor | no GitHub action | advice is not authorization |

## No self-approval

The author of a change never authorizes its merge; only the owner's label does.

## Conflicts with current rules

None found. Open point for the coordinator: the "Immediate rule, before the App exists" bullet of
`AGENTS.md` › Inviolable prompts (issue #130) still speaks of a rule that applied before the App existed, so its
wording needs a coordinator update (the App now exists; not every session uses it).

## Role markers (#332)

The pull request template and the task form show each role by a text marker, the README's glyph as an emoji so it
shows in any GitHub view: 🔑 owner, 🔍 advisor, 📋 coordinator, 💻 delegate. A marker helps a reader; it proves
nothing. The signature (`— <role> <provider/model>`) and the Git author stay what tells the roles apart.
