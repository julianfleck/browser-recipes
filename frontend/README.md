# Bridge workspace and browser extension

Run `pnpm dev` from the repository root to start Vite and the backend. Open <http://127.0.0.1:5173/install> in a Chromium browser to download the unpacked extension. Enable Developer mode, load the folder with `manifest.json`, then reload the workspace to pair. Firefox and Safari have not been verified.

## Record and prepare a tool

1. Open an authorized HTTPS site. Sign in first if the task needs an account. Open the extension, describe the task, and start recording. Grant access to that origin.
2. Demonstrate the task, then finish recording. Select page content, a list, copied text, or individual results. Shift-click adds targets to a numbered selection.
3. Choose **Build my tool**. Review any clarification or permission request. The backend tests the recipe and saves it on success.
4. Open the tool in the workspace to inspect its actions, input bindings, and test result. Use the MCP overview to connect a client. For expired site login, sign in again and use **Save / update website login** in the extension.

The service worker handles recording and hands it off to the backend. The app displays preparation status and provides the recipe editor. See the [implementation handoff](../backend/docs/teaching-flow.md) for the component boundaries and persisted state.

## Develop

- `extension/` holds the service worker, on-page recorder and local pairing bridge. `src/ExtensionPopup.tsx` is the popup entry point.
- `pnpm build` compiles the app and popup and generates the unpacked `extension-build/` folder along with `public/agent-session-bridge.zip`.
- For an existing unpacked installation, load the rebuilt folder or replace the files in the currently installed folder. Reload the extension and affected tabs.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` from this folder for frontend-only checks.
