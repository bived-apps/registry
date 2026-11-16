#!/bin/sh
# MCP over SSH: run a stdio MCP server on another machine and speak to it through ssh's stdin/stdout.
# From the environment (never written in the repository):
#   BIVE_MCP_SSH=user@host        the machine (or a Host alias of ~/.ssh/config)
#   BIVE_MCP_SSH_KEY=~/.ssh/key   optional: a key dedicated to MCP (only this key is offered); on the remote side,
#                                 pin it to the server with a forced command in authorized_keys (see the README)
# Usage, in opencode.jsonc › mcp: ["sh", ".bive/mcp-ssh.sh", "<remote command>", "<args>"...]
# With a forced command the remote command given here is ignored by sshd: the key can only start the MCP server.
# Key-based login only (BatchMode): a password prompt would hang the agent.
set -eu
: "${BIVE_MCP_SSH:?set BIVE_MCP_SSH=user@host for the MCP server over SSH}"
if [ -n "${BIVE_MCP_SSH_KEY:-}" ]; then
  set -- -i "$BIVE_MCP_SSH_KEY" -o IdentitiesOnly=yes -o IdentityAgent=none "$BIVE_MCP_SSH" "$@"
else
  set -- "$BIVE_MCP_SSH" "$@"
fi
exec ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 "$@"
