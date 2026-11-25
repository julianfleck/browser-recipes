# Website macros → agent tools

## Product model

A user demonstrates a task on a website and turns that macro into an agent command. The primary hierarchy is **website → MCP server → tools**, with nested library groups under a website. Groups organize the library; they do not create extra servers or alter execution. The extension is the recorder/reviewer. A local backend owns execution, saved authentication, tool availability and MCP access.

This supersedes the initial single-page read-only, active-tab runner. Version 1 recipes and the extension queue remain compatibility code. The current server wires teaching tests and MCP calls to `HeadlessRunner`; it does not ask the user's browser to answer a reader.

## Recording and creation

1. In the extension, describe the intended task first (for example, “Search using an agent-provided query and return the first ten links”). Then start recording on the chosen HTTPS site. The intent and recording survive same-origin navigation in extension storage.
2. Demonstrate the task. The recorder observes navigation, clicks, ordinary input, supported keys, and copy actions. It captures bounded, locally verified alternative locators. It retains selected-result positions when repeated numeric test IDs provide collection evidence. Typed examples remain local; private-looking inputs are redacted heuristically, not by a comprehensive secret detector.
3. Choose the outputs and select **Build my tool**. Bridge captures this site's cookies and storage into the encrypted local vault, saves the recording, and starts a durable backend preparation job. Command names, selectors, and URL behavior are not required creation fields.
4. `ToolBuilder` sends the intent and `refinementEvidence` to the configured OpenRouter model. This evidence includes action indices, UI labels, selectors, locator alternatives, pathnames and query parameter names. Input values, query values, authentication and returned page/image content are excluded. The original `/infer` naming endpoint remains compatibility functionality.
5. The model may retain a subset of observed actions in order, choose variable/fixed input bindings, map observed URL parameters to inputs, and select only observed locator alternatives. The initial action and selected result cannot be removed. `applyRefinement` validates every decision; it accepts no generated scripts, arbitrary actions, new URLs, or permission expansion.
6. If intent is ambiguous, the app/extension asks at most three short choice questions (“Let the agent choose” or “Always use the recorded value”). Answers persist. A blocked form request can request the user's explicit permission for the recorded form. Saved login alone is not permission to make changes.
7. Preparation tests headlessly and can refine/retry up to three attempts. Invalid plans are rejected before browser actions. Automatic retries stop for recipes allowing changes, any possibly mutating request, expired login, missing browser, cross-site navigation or a total-run timeout. A successful test automatically saves the tool to the website's MCP. No separate manual Test/Save sequence is required. Closing the overlay or popup does not stop backend preparation; interrupted backend work can be resumed.
8. The normal recipe view uses readable action cards and blue input tokens. URL checkpoints, selectors and command metadata are under **Advanced settings**. **Apply & check** checks a reviewed edit and saves it after a successful run, preserving the user's input choices during repairs. Recipe changes invalidate old results and MCP availability until retested.

`ToolBuilder` persists summaries, questions, answers and attempt diagnostics with the teaching. Teaching file writes use atomic rename so polling cannot observe truncated JSON. Generated command names are made unique within the MCP both on initial creation and on regeneration/refinement.

## Backend execution

`headless-runner.js` restores the encrypted snapshot into an isolated Playwright Chromium context. It can open a public site with an empty context when no saved authentication exists. Browser and extension may be closed after recording. The backend itself must remain running.

The runner replays the sequence with Playwright's element actionability waits: navigation, click, input, supported key, copy, output. It does not wait for all page assets to finish. Each locator operation has a 10-second timeout, navigation 20 seconds, and the whole run 90 seconds; browser processes close on completion/failure/timeout. A failed run returns a bounded error state and failing step, never raw browser exceptions with page/session data. Same-origin concurrent runs are rejected; total concurrent runs are capped.

Page navigation is constrained to the recorded origin. Cross-origin SSO/new-tab/multi-domain macros are not supported. Service workers are disabled in headless contexts so network rules apply. Mutating HTTP requests and WebSockets are blocked unless the user enables **Allow this tool to make changes on the website** for that recipe. A blocked first-party write makes the test fail with `write_permission_required`, rather than claiming a successful replay.

Native selected-text copy is replayed from the recorded DOM source/range. Website `navigator.clipboard.writeText` controls are replayed by their recorded click and captured in a per-run clipboard. Runs do not read or change the user's OS clipboard. Arbitrary background clipboard changes outside the recorded website are not monitored.

Successful authenticated runs checkpoint refreshed cookies and storage into the vault, unless the user has replaced the snapshot during the run. Login portability depends on the site. Device binding, IndexedDB-only authentication, SSO outside the origin, bot checks, MFA, canvas actions, uploads/downloads and cross-origin frames need further work. Expired login redirects produce a reconnect message when detected. The popup's **Save / update website login** refreshes an existing website snapshot after signing in.

Jobs are in memory; finished test results and step activity are persisted in the teaching independent of UI polling. Backend restart interrupts in-flight jobs. Old recipes run through a single-page legacy adapter until explicitly edited; old contextual clicks are not silently promoted into executable actions. **Use all recorded steps** explicitly rebuilds an older tool from its original recording, resets the write rule, and requires saving/testing the new recipe.

## Workspace and MCP

The web app lists website servers and their tools in sortable tables. Nested groups, renaming, drag/drop moves and keyboard/menu moves persist in `ToolLibrary`. The backend rejects group cycles and cross-website placements. The details sheet has a single main scrolling surface: result preview, editable metadata, action sequence and per-recipe write rule. Selectors are secondary editable fields. JSON is not the recipe UI.

Each exact website host has a local Streamable HTTP MCP endpoint at `http://127.0.0.1:8787/mcp/<host>`. Connect agent copies a configuration with a random bearer token scoped to that origin. Tokens are encrypted in the vault. **Revoke previous access** rotates the website's token; removing its saved session also revokes that token. The app's pairing token is not used as MCP access.

The MCP SDK implements initialization, `tools/list` and `tools/call`. Discovery includes only saved, unarchived teachings for this website, with names from the recipe's command ID and JSON Schema variables. MCP calls must supply variables explicitly; recording examples are used only for human tests. Calls use the same backend runner. Archived tools and edited-but-unpublished recipes are not callable.

Local API requests use the app pairing bearer token. Website origins are rejected; extension origins are accepted only for authorized routes with pairing. CORS and Host validation remain required. This is a single-user localhost pilot, not an authenticated multi-tenant hosted service.

## Verification

Run parent `pnpm test` (backend/frontend tests, typecheck, production build). `backend/test/mcp-server.test.js` binds an ephemeral loopback port and exercises an actual MCP client. Other tests cover recipe validation, variable schemas, headless job finalization, legacy compatibility, grouping invariants and extension submission. Browser checks should include actual wheel scroll over expanded recipe fields and nested result previews, mobile, drag/drop and keyboard reorder, session restore/checkpoint, and clipboard replay in isolated fixtures. Never test consequential actions against a real account without direct authorization for that action.

## MCP navigation, command names and feedback

`/mcps` is the MCP overview. `/sites` presents the same website/server identities. Both branches of the sidebar use an accessible nested tree and point to `/mcps/<exact-host>`, which shows only that MCP's tools. `Tools` is a child under each MCP. Tool deep links use `/mcps/<host>/tools/<teaching-id>`; legacy teaching links resolve to their website. Each MCP tools page has a copyable endpoint URL and a single collection toolbar for all tools, archived tools, search and recording.

The LLM suggests a separate snake_case `command` in addition to human title/description. The recorder and recipe editor expose it. The saved recipe ID's action segment is the actual MCP callable name. Names are validated and unique within the exact website; built-in `report_tool_issue` is reserved. Input steps show variable/fixed mode, parameter name and example or fixed value without expanding selector details. A call signature previews the parameters; fixed values are excluded from the MCP schema.

The overview distinguishes a saved login from one verified by a successful run. Detected expired login is persisted as `needsReconnect`; importing new authentication clears it and a successful headless run records verification. Other execution failures are shown separately from agent reports.

Every website MCP includes **`report_tool_issue`**, even with no published custom tools. It accepts `issue` (`login_expired`, `page_changed`, `execution_failed`), bounded `message`, and optional `tool_name` (required for tool-specific failures). Its MCP bearer token scopes the report to that website. Reports cannot invoke browser actions or alter recipes. They are stored locally under `data/mcp-feedback/` with private file permissions, deduplicated by open website/tool/issue, and never passed to the naming model.

The overview shows **Login required** or **Repair required**, report count and actions to reconnect, review the affected recipe, or re-record it. The report sheet labels its source as an agent report. The user can mark a report resolved. A successful current-revision test resolves reports for that tool; a successful test resolves login reports for that affected tool, while a new imported login resolves site-wide expired-login reports. Re-recording currently creates a replacement: test it, archive the outdated tool, then assign the original command name to the replacement if needed. There is no silent automatic recipe repair.

## Named MCPs, lifecycle and navigation (extension 1.2)

MCPs now have stable IDs and persistent `name`, `endpoint`, `origin` and `enabled` fields in `data/mcps/mcps.json`. The name is the overview/sidebar label; the endpoint is the exact `/mcp/<endpoint>` slug. App routes use stable IDs, so renaming an endpoint does not break navigation. Existing website endpoints are seeded on startup; existing tools are assigned to their default MCP. Legacy MCP access is accepted only for migrated servers until a new per-MCP token is issued.

`GET|POST /api/mcps` lists/creates MCPs. `POST /api/mcps/:id` updates name, endpoint or activation. `/duplicate` copies tool definitions and groups to a new, inactive MCP with a unique endpoint; copied tools are drafts and must be tested again. Authentication stays with the website and is not duplicated into recipes. `/delete` soft-deletes the MCP, revokes its token and disables its endpoint, while retaining local recordings and website authentication. Inactive or deleted MCPs reject discovery and calls; already running calls may finish. A deleted endpoint may be reused by a new MCP with independent credentials.

`/test` performs a bounded, read-only reachability check in an isolated browser. It does not replay tools or submit forms. A reachable website is not proof that all authenticated flows work; the UI asks the user to test a tool for that verification. Connection redirects/forms can identify a fresh login requirement.

The overview shows name-only entries and compact Create tool / Activate or deactivate / Test / More controls. Editing names/endpoints and adding an MCP use a right drawer. Delete requires a deliberate hold. The extension popup chooses which MCP receives a recording when multiple MCPs use the same website.

Navigation is handled by the History API with an application-wide workspace cache. Ordinary internal links, keyboard tree selection and browser Back/Forward stay inside the app; modified clicks and external links preserve normal browser behavior. The sidebar lists individual tool names beneath each MCP. Sites are aliases to their default website MCP.

## Numbered result selection and images

In review, choose **Select results**. Click the first result, then **Shift-click** to add/remove elements. The recorder paints numbered outlines, maintains them during scrolling/resizing, and shows the selected outputs in order. **Done selecting** finishes the selection. Page text, repeated text lists and copied text remain available. Selecting an output does not activate the website element.

Recipes store selector, kind and editable output label for each selected element, never image bytes or output page text. Up to 20 selected outputs are supported, including text, links, images, SVGs/canvas and result cards with images. Input values remain agent variables unless marked fixed.

At replay, navigation caused by an input/click/key is followed rather than reopened from its recorded example URL. Query-string changes from agent input are preserved. This supports forms that navigate from a search page to results with a different query. Matching remains based on recorded selectors/positions; dynamic path segments, unusual client-side debouncing and bespoke readiness conditions still need explicit support and site-specific verification.

The backend resolves selected outputs against the new results. It returns numbered text and link metadata, and captures actual image content as JPEGs from the authenticated browser. Images wait for loading/visibility and are limited to 5 images, 1 MB each, 4 MB total; text is bounded to 10,000 characters per selected output. The app and extension preview the actual captured images before publishing. SVG/canvas elements can be returned as raster screenshots.

MCP results carry image content blocks plus structured metadata; image bytes are not duplicated in the JSON text block. The workspace summary API omits test payloads so navigating the overview does not download every captured image. Detailed test results, including images, are private local teaching data. No captured images, authentication or input values are sent to the naming model.

### Run diagnostics

The app, extension popup, and on-page review expose a collapsed **Run logs** panel with **Copy logs**. Each backend run includes its ID, elapsed phase/step activity, outcome, and a bounded first-line browser error. The error strips quoted payloads, URLs, field values, and saved session values; it does not include browser call-log bodies, page content, or console/network payloads. Logs are saved with the test so they remain available after a backend restart. Older tests show their saved phase timeline and explain that a new test is needed to capture the detailed error.

A controlled browser fixture covers responsive inputs, changing queries, delayed filters, and result IDs that vary between runs. Verify each site’s account and automation rules before recording or running against a real account.
