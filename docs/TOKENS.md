# Token ratio

The plugin `.opencode/plugins/token-ratio/` measures how much the agents produce for what the humans write. **Human** tokens are the messages
typed in a root session (a coordinator's prompt to its delegate counts as agent work), estimated at four characters
a token; **agent** tokens are the providers' own output and reasoning counts. Each message adds one line of numbers
(no text) to `.bive/state/tokens.jsonl` in the main checkout, shared by every worktree. Only the sessions whose
directory is the checkout or worktree itself are counted there: OpenCode sends every session's events to every
plugin instance, and OpenCode starts one instance per directory, so a session elsewhere is left to its own. Totals:

```bash
jq -s 'group_by(.kind) | map({(.[0].kind): (map(.tokens) | add)}) | add' .bive/state/tokens.jsonl
```

**Live on GitHub (opt-in).** Create a public gist holding a file `bive-tokens.json` (`gh gist create --public
bive-tokens.json`), then `export BIVE_TOKENS_GIST=<gist id>` on the agents' machine. The plugin rewrites that file at
most every five minutes (with `gh`, signed in) as a [shields.io endpoint](https://shields.io/badges/endpoint-badge),
so a README badge shows the ratio live:

```markdown
![human : agent tokens](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/<you>/<gist id>/raw/bive-tokens.json)
```

Only the two totals leave, never a message. Start a delegate's own OpenCode process with `BIVE_ROLE=delegate`: its
prompt is the coordinator's, so it counts as agent tokens. An app that drives agents can show the same file in its own panel.
