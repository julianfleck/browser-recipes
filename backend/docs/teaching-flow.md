# How Browser Recipes works

Browser Recipes turns a website demonstration into a tested MCP tool. A website owns the saved login. Its MCP servers own their tools, groups, endpoints, and access tokens.

## Record and prepare a tool

1. Open the local workspace in the browser where the extension is installed. The workspace pairs with the extension over the loopback connection.
2. Open the target HTTPS site and describe the task in the extension. Grant access to that origin, then demonstrate the task. The recorder observes navigation, clicks, input changes, supported keys, and copy actions.
3. Choose a result. Select page text, one element, multiple elements with Shift-click, a repeated list, or text copied during the demonstration. Then choose **Build my tool**.
4. The extension submits the recording and saves authentication for the authorized website in the local encrypted vault. The backend builds a recipe from the observed actions. When OpenRouter is configured, it can suggest input bindings, choose observed locator alternatives, and ask for clarification.
5. The backend tests the recipe in isolated headless Chromium and saves it after a successful run. It can refine and retest a read-only recipe up to three attempts. Write-enabled recipes are never retried automatically. You can close the recording overlay while preparation runs.

The editor shows the action sequence, variable and fixed inputs, and the test outcome. **Advanced settings** exposes selectors, URL behavior, and the callable command name. A change to an executable action requires a successful test of the updated recipe before it is available to clients.

## Run a tool through MCP

Open **MCPs**, select a server, and choose **Connect agent** to copy its Streamable HTTP URL and bearer token. The local backend must be running for calls. The recording browser and extension can close after setup.

MCP clients see tested, saved, unarchived tools on active servers. Each client call supplies the declared variable inputs. Fixed inputs stay in the recipe. Results can include bounded text, links, and images. Each server also exposes `report_tool_issue` for execution, page, or login problems. Reports appear in the workspace for review.

A website can have multiple MCP servers sharing its saved login. Each server has its own stable ID, editable name and endpoint slug, access token, and tool collection. Deactivating or deleting a server blocks new calls. Duplicated tools need their own successful test.

## Execution and storage

The runner opens an isolated browser context, restores the website's cookies and storage, and validates actions against the recipe's authorized origin. Mutating requests require an explicit rule for that recipe. Successful authenticated runs can save refreshed authentication. Website logins can be renewed through **Save / update website login** in the extension.

Recordings, ordinary field values, results, and run logs stay in the local data directory. Private field detection is heuristic. When a model is configured, it receives the task and action structure. The model request omits field values, query values, authentication, and returned page content. Completed test results persist on disk. A backend restart interrupts runs in progress.

See the [recipe contract](workflow-contract.md) for supported actions, output limits, and API routes.

## Code map

| Responsibility | Source |
| --- | --- |
| Popup, recording, and pairing | `frontend/src/ExtensionPopup.tsx`, `frontend/extension/` |
| Tool library and recipe editor | `frontend/src/Teachings.jsx`, `frontend/src/RecipeEditor.jsx`, `frontend/src/McpsPage.jsx` |
| Recipe validation and model refinement | `backend/src/macro-recipe.js`, `backend/src/workflow-refinement.js` |
| Preparation and browser replay | `backend/src/tool-builder.js`, `backend/src/headless-runner.js`, `backend/src/teaching-store.js` |
| Local API, session vault, and MCP | `backend/src/http-app.js`, `backend/src/browser-session-store.js`, `backend/src/mcp-registry.js`, `backend/src/mcp-server.js` |

Run `pnpm test` from the root. Use controlled fixtures to test navigation, authentication restore, and recipe changes. Share only redacted diagnostics when filing issues.
