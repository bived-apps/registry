import { execFile } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Pure decision: given a merge commit's committer and the authors of the commits it
// brings in (those reachable from the second parent but not the first), refuse when
// the committer also authored one of those commits, or when the pushed commit is
// not a merge commit (no second parent). Used by the push-triggered check on
// `bived` and `milestone/*` (issue #114).
export function checkMergeAuthority({ isMergeCommit = false, committer = null, authors = [] } = {}) {
  if (!isMergeCommit) {
    return { ok: false, reason: "push to the integration branch must be a merge commit" }
  }
  if (committer && Array.isArray(authors) && authors.includes(committer)) {
    return { ok: false, reason: "merge committer must not be the author of a commit it brings in" }
  }
  return { ok: true, reason: "merge committer is not an author of the commits it brings in" }
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args.join(" ")} failed: ${(stderr || error.message).trim()}`, { cause: error }))
        return
      }
      resolve(stdout)
    })
  })
}

async function gatherFromGit(sha) {
  const parentsRaw = (await runGit(["rev-list", "--parents", "-n", "1", sha])).trim()
  const parts = parentsRaw.split(/\s+/)
  const commit = parts[0]
  const parents = parts.slice(1)
  const isMergeCommit = parents.length >= 2

  const committer = (await runGit(["log", "-1", "--format=%cn <%ce>", commit])).trim()

  let authors = []
  if (isMergeCommit) {
    const first = parents[0]
    const second = parents[1]
    const log = await runGit(["log", `${first}..${second}`, "--format=%an <%ae>"])
    authors = log.split("\n").map((s) => s.trim()).filter(Boolean)
  }
  return { isMergeCommit, committer, authors }
}

async function main() {
  const sha = process.env.GITHUB_SHA || process.argv[2]
  if (!sha) throw new Error("GITHUB_SHA (or a commit SHA argument) is required")
  const info = await gatherFromGit(sha)
  const result = checkMergeAuthority(info)
  console.log(`bive-merge-authority: ${result.reason}`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`bive-merge-authority: ${error.message}`)
    process.exitCode = 1
  })
}