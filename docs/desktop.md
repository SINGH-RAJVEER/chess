# Desktop

The desktop application is an Electron shell around the web application. It lives in `apps/desktop` and reuses the React UI from `apps/web` without duplicating it.

The app displays `SixtyFour`, uses `dev.sixtyfour.desktop` as its application ID, and uses a `64` icon for the window and installers. The shared web client uses the same mark as its favicon.

## Layout

- `apps/desktop/main.cjs`: creates the frameless window and serves the packaged web assets through the secure `app://sixtyfour` protocol.
- `apps/desktop/preload.cjs`: exposes the small, context-isolated desktop bridge used for window controls.
- `apps/desktop/launch-electron.cjs`: clears inherited Electron runtime flags before starting the desktop process.
- `apps/desktop/package.json`: Electron and electron-builder settings, including the platform installers.
- `apps/web`: shared React application, built before packaging.

The desktop settings section controls whether the header close button is shown. It is on by default; when shown, it sits at the far right of the header.

The computer opponent picker presents the built-in minimax engine with alpha-beta pruning as one option labeled `Default`, alongside Stockfish.

## Modes

- Development (`just desktop-dev`): loads the Vite development server at `http://localhost:3000`. Start `just web-dev` first; its `/api` proxy handles API requests and hot reload.
- Production (`just desktop-build`): rebuilds `apps/web/dist`, then packages those assets into AppImage and deb installers on Linux, a dmg on macOS, and an NSIS installer on Windows.

The production renderer is loaded from the secure `app://sixtyfour` origin. The web client detects Electron through its preload bridge and talks directly to `http://127.0.0.1:4000` by default for auth and game sockets. Set `VITE_DESKTOP_API_URL` at web build time to override that host. Add `app://sixtyfour` to the API's comma-separated `WEB_ORIGIN` list, for example `WEB_ORIGIN=http://localhost:3000,app://sixtyfour`, so credentialed requests are accepted. Google sign-in is not supported in the packaged app; email auth remains available.

## Commands

```bash
just web-dev         # start the Vite dev server (required before desktop-dev)
just desktop-dev     # open the Electron window against localhost:3000
just desktop-build   # produce release binaries and installers
just desktop-check   # syntax-check Electron entry points
just desktop-lint    # lint Electron entry points
just desktop-test    # run desktop package tests
just desktop-format  # format Electron entry points
just desktop-clean   # remove desktop build output
```

## Known gaps

- No updater, tray, or deep-link integration yet.
- The packaged build expects a reachable API host; it does not embed single-player mode or the API.
- The API OAuth callback allowlist does not currently support the packaged `app://sixtyfour` origin; use email auth in the packaged app.
