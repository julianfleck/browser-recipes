# Browser Recipes backend

The backend stores recordings and website authentication, tests recipes in isolated Playwright Chromium contexts, and exposes tools through MCP Streamable HTTP.

## Run

Use the [root quick start](../README.md) to run both services. From this folder, `pnpm install --frozen-lockfile`, `pnpm exec playwright-core install chromium`, and `pnpm dev` start the backend on `127.0.0.1:8787`. Set `CONNECTOR_CHROMIUM_PATH` if you use a separately installed executable. The local web app and extension expect the default port.

Copy [the environment template](.env.example) to `.env` for overrides. Set `OPENROUTER_API_KEY` to enable model assistance for naming and refinement. The model receives the task and sanitized action structure. The request omits captured input values, query values, authentication, and returned page content.

## Develop

- [Implementation handoff](docs/teaching-flow.md) covers recording, preparation, replay, and MCP lifecycle.
- [Recipe contract](docs/workflow-contract.md) describes validated operations, inputs, outputs, and API ownership.
- [Synthetic recipe example](examples/README.md) shows the current format without user data.
- Run `pnpm test` here for backend-only checks. Integration tests use loopback and controlled browser fixtures.

## Local data

`data/` contains the authentication vault and its key, pairing and MCP credentials, recordings, results, and run diagnostics. Treat the whole data directory as private, including when `CONNECTOR_DATA_DIR` points somewhere else. Generated compatibility exports under `workflows/` may also contain private values. Use synthetic examples in contributions and remove captured content and tokens before sharing diagnostics.
