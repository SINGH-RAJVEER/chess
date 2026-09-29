# Desktop

The desktop application is a native shell around the web application built with Tauri 2. It lives in `apps/desktop` and reuses the React UI from `apps/web` without duplicating it.

## Layout

- `apps/desktop/src-tauri`: Rust crate that owns the window, the webview, and the build configuration.
- `apps/desktop/src-tauri/src/lib.rs`: application entry point shared by desktop and mobile targets.
- `apps/desktop/src-tauri/tauri.conf.json`: window size, dev URL, bundle settings, and icons.
- `apps/desktop/src-tauri/capabilities/default.json`: webview permission grant for the main window.
- `apps/desktop/app-icon.png`: icon source; regenerate platform icons with `bunx tauri icon app-icon.png -o src-tauri/icons`.

## Modes

- Development (`tauri dev`): the window loads `http://localhost:3000`, so the Vite dev server, its `/api` proxy to the Go API, and hot reload all work exactly as in the browser. The web dev server must already be running.
- Production (`tauri build`): `just desktop-build` rebuilds `apps/web/dist`
  first, and Tauri embeds those static assets into the binary.

## API access

The bundled web client resolves its API base at runtime. In the browser it
stays same-origin behind the reverse proxy (or `VITE_API_BASE_URL` when set).
Inside the Tauri shell it talks directly to `http://127.0.0.1:4000` by
default, overridable with `VITE_DESKTOP_API_URL` at web build time, for both
auth requests and the `/api/ws` game socket. That works in development
because Tauri loads the page from the Vite server; a packaged build has no
proxy, so the API must accept credentialed cross-origin requests from the
desktop webview origin (`https://tauri.localhost`): add it to the
comma-separated `WEB_ORIGIN` list, e.g.
`WEB_ORIGIN=http://localhost:3000,https://tauri.localhost`. Google sign-in
is unavailable in the shell (the OAuth callback cannot return to a Tauri
origin); use email auth there.

## Commands

```bash
just web-dev         # start the Vite dev server (required before desktop-dev)
just desktop-dev     # open the native window against localhost:3000
just desktop-build   # produce release binaries and installers
just desktop-check   # cargo check
just desktop-lint    # clippy with -D warnings
just desktop-test    # cargo test
just desktop-format  # rustfmt
just desktop-clean   # remove target/
```

The `desktop-*` recipes run through `devenv shell` automatically, so they work from any shell with the system libraries present. Plain `cargo`/`bunx tauri` invocations outside the devenv shell fail at `pkg-config` with missing `dbus-1` or WebKitGTK.

## System dependencies

On Linux, Tauri needs WebKitGTK, GTK, and D-Bus libraries. They are provided by the devenv shell: `webkitgtk_4_1`, `gtk3`, `libsoup_3`, `glib`, `cairo`, `pango`, `gdk-pixbuf`, `gobject-introspection`, and `dbus` are declared in `devenv.nix`. Run builds inside `devenv shell` (or via the `just desktop-*` recipes) so `pkg-config` can find them.

## Known gaps

- No updater, tray, or deep-link integration yet.
- The production build still expects a reachable API host; there is no embedded single-player mode.
- Mobile targets are scaffolded only at the code level (`lib.rs` entry point); no Android or iOS project files exist.
