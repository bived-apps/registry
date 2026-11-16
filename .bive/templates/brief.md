# Brief #<N> <title>

Branch `issue/<N>-<slug>` from `<integration branch>` · worktree `.worktrees/issue-<N>` · model `<provider/model>`

**Goal**: <!-- one or two sentences -->

**Read first**: <!-- files and functions, in order -->

**Steps**: <!-- exactly what to write: functions, files, signatures -->

**Shared files**: <!-- ownership and dependency constraints for known shared files (issue #72): which files this issue
  owns exclusively, which it depends on another issue's merge for, or "none". -->

**Done when**: <!-- observable criteria -->

**Checks**:
```bash
# lint and the tests of the files touched
```

<!-- Optional: use Parts instead of the single-session Steps/Done when/Checks above when the work exceeds the
     per-session limit of 3 source files and 1 test file. Each part is one session and must fit that limit. -->
## Parts (optional)

<!-- The coordinator alone creates PRs. Default: one PR against the named integration branch after the final part.
     If the coordinator should create/update a PR after each part, say so explicitly; each intermediate PR starts
     with `Part of #<N>` and names what remains. -->
**Pull request timing (coordinator)**: <!-- after the final part | after each part -->

### Part A — <short title>
**Steps**: <!-- exact work and files; max 3 source files + 1 test file in this session -->
**Done when**: <!-- observable criteria for this part -->
**Checks**:
```bash
# this part's lint and tests
```

### Part B — <short title>
**Steps**: <!-- exact work and files; max 3 source files + 1 test file in this session -->
**Done when**: <!-- observable criteria for this part -->
**Checks**:
```bash
# this part's lint and tests
```

Scratch files go under `.bive/state/` in your worktree, never `/tmp` or `$TMPDIR`; edit files with your edit tool
(the guard refuses most pipes and all backticks in shell commands).

Follow the pull request timing above. After your assigned part, push the issue branch and return the filled
`.bive/templates/report.md` to the coordinator in your final response. The coordinator creates or updates the PR;
its body starts with `Closes #<N>` when complete, or `Part of #<N>` and what remains. If the coordinator must read
the report from another machine/session, include it in the body of the final pushed commit; the coordinator fills in
that commit's SHA. Do not rely on an ignored `.bive/state/` file for cross-machine transfer.

**Issue**: <!-- pasted -->
