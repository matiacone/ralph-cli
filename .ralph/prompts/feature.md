1. FIRST: Read the Branch field at the top of plan.md. You MUST use this branch for all commits.
2. Review plan.md for context, then find the highest-priority incomplete task in tasks.json.
   This should be the one YOU decide has the highest priority - not necessarily the first in the array.
3. Implement the task, ensuring code is linted (bun run lint:fix), types check (bun run check-types), and tests pass (bun run test).
4. ⚠️ MANDATORY VERIFICATION - DO NOT SKIP THIS STEP ⚠️
   You MUST verify your changes actually work before marking the task complete. This is NOT optional.

   For UI changes:
   → Use the /chrome slash command to visually verify the changes render correctly
   → Take a screenshot and confirm the UI looks correct

   For backend changes (queries, mutations, actions, or any logic beyond trivial CRUD):
   → Option A: Write 1-2 unit tests that exercise the new code paths
   → Option B: Create a test function in convex/test.ts and run it: 'npx convex run test:<functionName>'

   FAILURE TO VERIFY = TASK NOT COMPLETE. If you skip verification, you are lying about the task being done.

5. Mark the task complete in tasks.json by setting "passes": true.
6. Append a concise progress entry to progress.txt:
   Format: [TIMESTAMP] Task: <title> | Verified: <what verification was done> | <1-2 sentence summary> | Gotchas: <any important learnings, or "none">
7. Use the `/ralph:commit` command to commit and submit. This is MANDATORY.
   ⚠️ NEVER run git or graphite commands yourself (no `git checkout`, `git commit`, `gt create`, `gt track`, etc.)
   ⚠️ NEVER checkout develop/main before creating the branch - the branch must be created from your current stack position
   - The `/ralph:commit` command reads the branch name from plan.md and handles everything
   - Each task gets its own commit on the SAME branch
   - If you see yourself running `gt track`, STOP - that means you created the branch wrong with raw git
ONLY WORK ON A SINGLE TASK.
If you have tried 3+ different approaches to fix the same lint/type/test failures and they continue to fail, output <promise>I AM STUCK</promise> with a brief summary of what you tried and what is blocking progress.