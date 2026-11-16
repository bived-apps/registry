# MCP over SSH

An agent can use an MCP server that runs on another machine (the app's own machine, a GPU worker) without any port
opened: the stdio server is started over SSH and speaks through ssh's stdin and stdout.

1. On the remote machine, the server runs as a command (e.g. `~/app/.venv/bin/python -m app.mcp_server`) and the
   agent's machine logs in with a key (no password prompt: `BatchMode`).
2. On the agent's machine, set the host in the environment, never in the repository: `export BIVE_MCP_SSH=user@host`
   (or a `Host` alias of `~/.ssh/config`).
3. In `opencode.jsonc` › `mcp`, the command is `["sh", ".bive/mcp-ssh.sh", "<remote command>", "<args>"...]` (an
   example is commented there).

**Which key: your choice.** Without `BIVE_MCP_SSH_KEY`, ssh uses your usual keys and agent (simplest). With it, MCP
gets a dedicated key that cannot open a shell:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/bive_mcp -C "bive mcp"      # on the agent's machine
export BIVE_MCP_SSH_KEY=~/.ssh/bive_mcp                             # only this key is offered (IdentitiesOnly)
```

On the remote machine, one line in `~/.ssh/authorized_keys` pins the key to the server (a forced command: whatever
the client asks, sshd runs only this; no shell, no forwarding, no pty):

```text
restrict,command="/Users/you/app/.venv/bin/python -m app.mcp_server" ssh-ed25519 AAAA... bive mcp
```

Revoke it by deleting that line. The agent never reads `~/.ssh` (denied in `opencode.jsonc`): only the `ssh`
program does. Everything the server
returns goes through the server's own rules (its consent scopes, its egress gate) exactly as on one machine.
