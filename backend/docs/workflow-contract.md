# Macro recipe contract

Version 2 is the current saved tool recipe. Version 1 DOM read recipes are supported through `legacyMacro()` and retain their original single-page semantics until edited.

## Version 2

A recipe has `schemaVersion: 2`, `id` (`provider.command`), `provider`, exact HTTPS `origin`, human `title`, `description`, `effect: interaction`, explicit boolean `allowWrites`, and ordered `steps` (1–100). No executable scripts, arbitrary keys or cross-origin navigation are accepted. `validateMacro()` checks paths, selectors, variable uniqueness, input types and result operations. At least one copy or output step is required.

Each step has a stable unique `id`, `type`, same-origin `path`, optional short `label`, and (except navigation) a CSS `selector`.

| Type | Fields and behavior |
| --- | --- |
| `navigation` | Open `origin + path`; skip redundant navigation to an already open URL. |
| `click` | Wait for and click exactly one matching element. |
| `input` | `inputKind`: text/select/checkbox/contenteditable. `binding`: variable/static. `variable` is a unique lowercase identifier. `value` is a local example/default for human testing or a fixed value for static binding. Private redacted fields omit values. |
| `key` | Enter, Tab, Escape, ArrowDown, ArrowUp, Space only. |
| `copy` | Read the observed DOM source, optionally using zero-based `start`/`end` text offsets. `clipboard: true` returns the per-run clipboard populated by an earlier website copy control. Raw copied text is not recorded. |
| `output` | `mode`: one/page/list. One requires one matching element. Page/one text is bounded to 10,000 chars; lists to 100 items of 1,000 chars each. |

Ordinary inputs default to agent variables. Static inputs are excluded from MCP schemas. MCP requires all declared variables and rejects additional keys; human tests may use recorded examples. Inputs are limited to 500 characters (checkboxes are booleans). `allowWrites` is a per-recipe user rule; changing it or any executable recipe detail increments the revision and invalidates the successful test.

The optional model suggests tool metadata and refines the observed action sequence. It can choose existing locator alternatives and propose variable bindings. The compiler validates these choices against the recording. The model receives input metadata without values.

## State and jobs

Teaching states: `recorded` (legacy), `needs_model` (legacy), `draft`, `tested`, `saved`. Archive is independent. Current creation produces a draft immediately without requiring model availability. Recipe edits set draft, clear prior result/run and increment revision. Backend jobs capture the revision and cannot approve a changed recipe.

Jobs have ID, teaching ID, revision, origin, state, phase, timestamps, ordered bounded step events, and result. Phases are loading_session/opening_page/replaying/saving_result/completed; replay events include stepIndex and stepLabel. A successful result is `{state: found, result, copied?}`. Failed results contain a bounded state code and optional failing stepIndex. Raw Playwright exceptions are not API results. Completed test results persist without an app polling GET.

## HTTP ownership

- `POST /api/teachings/infer`: suggest title/description from sanitized recording.
- `POST /api/browser-sessions`: paired extension saves encrypted origin authentication.
- `POST /api/teachings`: paired extension creates deterministic macro draft.
- `GET /api/teachings/:id`: teaching plus latest backend job.
- `POST /api/teachings/:id/recipe`: validate edited recipe; invalidate publication/test.
- `POST /api/teachings/:id/build`: prepare, test, and save a recipe after a successful run.
- `POST /api/teachings/:id/test`: start backend run; human tests can use examples.
- `POST /api/teachings/:id/save`: publish only after success.
- `POST /api/teachings/:id/archive|restore`: disable/restore library visibility and MCP eligibility.
- `GET|POST /api/library`: persistent nested groups and tool ordering; cycles and cross-site moves rejected.
- `POST /api/mcp-access`: issue/rotate an origin-specific MCP token.
- `/mcp/<endpoint>`: SDK Streamable HTTP server, per-server bearer authentication, saved tools only.

The legacy `/api/browser-workflows/*` queue and version 1 definitions remain compatibility code. Current UI tests and MCP calls do not use them.

## Boundaries and remaining work

The product direction is to record website tasks as agent-accessible macros. Current operations are DOM navigation/click/fill/keys/copy/text extraction on a single origin. It does not yet implement arbitrary frames, new tabs, file operations, drag gestures on the target site, canvas actions, multi-origin authentication or universal session portability. Cookie, localStorage and sessionStorage import are implemented; IndexedDB-only auth and device-bound credentials require additional support. MCP and replay are local; a hosted service needs per-user authorization, managed secret keys, quotas, audit/revocation controls and provider-specific policy validation.

## Built-in feedback tool

Each origin-scoped MCP includes `report_tool_issue`. Its schema requires `issue` and `message` (1–1,000 characters), and accepts `tool_name`; non-login issues require a matching tool on this origin. Issue values are `login_expired`, `page_changed`, `execution_failed`. Open reports store teaching identity, callable name, source, timestamps, occurrence count and resolution state. Reports are untrusted agent observations and are rendered as text, not instructions. Repeated reports update one open record. Local persistence is serialized and atomic, with a bounded report count.

`GET /api/mcp-feedback` lists reports for the local authenticated workspace; `POST /api/mcp-feedback/:id/resolve` resolves one. These are app routes, not anonymous website endpoints. MCP submission uses the origin-specific MCP token. Saved-session import resolves login-expiry reports; successful current-revision execution resolves tool reports. `report_tool_issue` is reserved and cannot name a custom recipe.

`command` is the LLM-suggested snake_case callable name. It is stored as the action segment in `recipe.id`, validated independently of the display title, and editable in both the recording review and recipe editor. Variable inputs remain required typed MCP arguments; fixed inputs are omitted from discovery schemas.

## MCP registry and selected outputs

A teaching's `mcpId` identifies its tool collection; command names are unique within that MCP. MCP records have stable UUID, name, unique endpoint slug, exact origin, activation state and creation time. Duplicate MCPs share only the website session; each has independent endpoint, token, tool IDs and groups. Duplicate recipes start as untested drafts. Migration retains the old website endpoint by default.

A version 2 output can use `mode: selection` with ordered `targets` (1–20). Each target has `selector`, `kind` (`text`, `image`, `link`, `element`) and optional `label` (80 chars). `step.selector` remains the first target for compatibility. Runtime output is `{state: found, result: {selections: [...]}}`. Each result has ordinal `index`, label/kind, optional text/href and optional image records. Images carry bounded JPEG data for local preview; the MCP serializer moves bytes into image content blocks and leaves only metadata in structured JSON.

A navigation step may set `follow: true`. It waits for the preceding action to reach the recorded pathname on the authorized origin, retaining the actual query string. Initial/direct navigation still opens its configured path. The recipe editor exposes this behavior. This does not infer arbitrary variable path templates or universal asynchronous readiness.

New failure states include `image_unavailable` and `output_too_large`. Image capture is bounded to five visible images (one MB each/four MB total), and selected text remains bounded. Unsupported/ambiguous selections fail visibly rather than returning a partial success.

### Query variables and current result positions

Navigation steps may contain `queryBindings: [{parameter, variable}]` referencing existing MCP input variables. Values are encoded through URLSearchParams, never interpolated as raw URLs. The compiler associates a query parameter with a single preceding ordinary input only when the decoded recorded value matches exactly; ambiguous associations remain unbound and editable. Values are compared locally and are not sent to the naming model.

Consecutive navigation observations following an input, key, or click are checkpoints (`follow: true`), including client-generated query updates. `waitForQuery` identifies query parameters that must match before continuing (bound inputs and newly changed filter values). Query-only metadata such as search IDs and timestamps is retained from the live page. The first navigation still opens the initial URL. Explicit URL-opening behavior remains available in the editor.

Interactive actions require exactly one visible match. Hidden responsive copies are excluded; two visible matches remain an error rather than selecting the first arbitrarily.

Selected outputs can specify a zero-based `index` (0–99) within a visible result collection. New recordings retain `{selector, index}` collection evidence when repeated test IDs share a numeric item-ID pattern. Selecting at least two elements from that observed collection promotes them to their actual recorded positions. Without position evidence, individual elements remain exact. The editor exposes the position and an exact-element alternative using `recordedSelector`. This handles changing product IDs; other repeating structures still need a reviewed selector. These rules do not establish universal readiness for asynchronous websites.
