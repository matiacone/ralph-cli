1. FIRST: Read the Branch field at the top of plan.md. You MUST use this branch for all commits.
2. Review plan.md for context, then find the highest-priority incomplete task in tasks.json.
   This should be the one YOU decide has the highest priority - not necessarily the first in the array.
3. Implement the task, ensuring code is linted (bun run lint:fix), types check (bun run check-types), and tests pass (bun run test).
4. ⚠️ MANDATORY VERIFICATION - DO NOT SKIP THIS STEP ⚠️
   You MUST verify your changes actually work before marking the task complete. This is NOT optional.

   For UI changes:
   → Use the Playwright MCP to visually verify the changes render correctly
   → Take a screenshot and confirm the UI looks correct

   For backend changes (queries, mutations, actions, or any logic beyond trivial CRUD):
   → Option A: Write 1-2 unit tests that exercise the new code paths
   → Option B: Create a test function in convex/test.ts and run it: 'npx convex run test:<functionName>'

   FAILURE TO VERIFY = TASK NOT COMPLETE. If you skip verification, you are lying about the task being done.

5. Mark the task complete in tasks.json by setting "passes": true.
   Include in your progress entry WHAT verification you performed (e.g., "Verified: Playwright screenshot" or "Verified: unit test added" or "Verified: ran test:myFunction").
6. Append a concise progress entry to progress.txt:
   Format: [TIMESTAMP] Task: <title> | Verified: <what verification was done> | <1-2 sentence summary> | Gotchas: <any important learnings, or "none">
7. Make a git commit using the branch from plan.md:
   - Check the current branch with 'git branch --show-current'
   - If you are NOT on the branch specified in plan.md:
     * Use 'git checkout -b <branch-name> && git add -A && git commit -m "<message>"' to create the branch with the exact name from plan.md
     * Then use 'git push -u origin HEAD && gh pr create --fill' to push and create a PR
   - If you are already on the correct branch:
     * Use 'git add -A && git commit -m "<message>"' to add a new commit
     * Then use 'git push' to push and update the PR
ONLY WORK ON A SINGLE TASK.
If you have tried 3+ different approaches to fix the same lint/type/test failures and they continue to fail, output <promise>STUCK</promise> with a brief summary of what you tried and what is blocking progress.