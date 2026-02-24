You are completing a feature in a SINGLE session. Complete ALL tasks in tasks.json before ending.

IMPORTANT: This is a oneshot run - there are no follow-up iterations. You must finish everything now.

1. FIRST: Read the Branch field at the top of plan.md. Use this branch for all commits.
2. Review plan.md for full context on the feature.
3. Work through ALL incomplete tasks in tasks.json, one by one.
4. For each task:
   - Implement the changes
   - Run lint (bun run lint:fix), type check (bun run check-types), and tests (bun run test)
   - Mark it complete in tasks.json by setting "passes": true
5. After ALL tasks are complete:
   - Comment on the GitHub issue with a summary of what was accomplished
   - Commit all changes to the branch specified in plan.md
   - Push and create/update the PR

If you encounter blockers on a task, comment on the GitHub issue noting the blocker and continue to the next task.
Do NOT stop until all tasks are either completed or documented as blocked.