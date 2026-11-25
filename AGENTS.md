# Agent Session Bridge

Start with the [implementation handoff](backend/docs/teaching-flow.md) and [recipe contract](backend/docs/workflow-contract.md). Run `pnpm test` from the root. Use synthetic browser fixtures for tests and keep credentials, vaults, recordings, diagnostics, and generated recipes out of commits.

The recorder observes website actions. The backend validates recipes and executes them on the authorized origin. Preserve model data minimization and the test and approval gates when changing replay or MCP availability. Keep compatibility fixtures in the test directory.
