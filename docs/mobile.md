# Mobile App

The app displays `SixtyFour`, uses the `sixtyfour` URL scheme and `sixtyfour-mobile` Expo slug, and uses `com.sixtyfour.mobile` on iOS and Android. The launcher, splash screen, and web favicon use the `64` mark. The new bundle identifiers create a separate app installation from earlier builds.

`apps/mobile` is an Expo (SDK 57) iOS and Android app with the same playable core as the web client: sign in, local pass-and-play, vs-computer games, and online matchmaking, all served by the Go API. UI is NativeWind (Tailwind) over React Native; shared request and domain types come from `libs/types`.

## Prerequisites

- The devenv shell, which provides Bun and Node.js. Expo CLI and Metro must run on Node; they crash under the Bun runtime, so always use the `mobile-*` just recipes (they enter the devenv shell) instead of bare `bun run`.
- For on-device runs: Expo Go, or a development build (`expo run:android` needs the Android SDK, `expo run:ios` needs macOS with Xcode).
- A reachable API. The app reads `EXPO_PUBLIC_API_URL` at build time and falls back to `http://localhost:4000`, which works for iOS simulators but not physical devices. On a phone, set it to your machine's LAN address:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 just mobile-dev
```

Then scan the QR code with Expo Go (same Wi-Fi network).

## Commands

```bash
just mobile-dev        # Expo dev server
just mobile-android    # dev build on Android
just mobile-ios        # dev build on iOS
just mobile-export     # bundle iOS + Android without a device
just mobile-typecheck  # tsc --noEmit
just mobile-lint       # biome lint
just mobile-check      # biome check
just mobile-clean      # remove .expo and dist
```

`just mobile-export` bundles both platforms through Metro and is the device-free sanity check for navigation, NativeWind, and imports.

## Structure

```text
apps/mobile/
├── app/                    # expo-router screens
│   ├── _layout.tsx         # stack, auth provider, status bar
│   ├── index.tsx           # menu, opponent picker, auth state
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   └── game.tsx            # local / computer / online game
├── src/
│   ├── components/
│   │   └── ChessBoard.tsx  # touch board, unicode pieces
│   └── lib/
│       ├── api.ts          # API client (token cookie auth)
│       ├── auth.tsx        # auth provider (SecureStore)
│       └── pieces.ts       # glyphs and square helpers
├── assets/                 # app icons
├── app.json                # Expo config (iOS + Android)
├── metro.config.js         # NativeWind + monorepo resolution
└── tailwind.config.js
```

## Auth on Mobile

The API authenticates with a signed `better-auth.session_token` cookie, and the sign-in response body also carries the raw `session.token`. The mobile client stores that token in SecureStore and sends it back as a `Cookie` header on every request, so sign-in works identically on iOS and Android without relying on platform cookie jars. Google sign-in is not offered on mobile yet; it needs a browser redirect flow.

## Game Flows

- Local: `vs_player` board, both sides move on the device.
- Computer: `vs_computer` board with a Default minimax engine (alpha-beta pruning) and Stockfish picker; the screen polls while it is Black's turn.
- Online: requires sign-in; joins the matchmaking queue, polls queue status until matched, then polls the board. Moves are allowed only for the signed in player's color (`userColor`).

Promotion shows a four-piece picker; undo, draws, and clocks are not in the mobile client yet.

## Monorepo Notes

- `metro.config.js` watches only `libs/types` (watching the whole repo exhausts file watchers) and resolves modules from the app and root `node_modules`.
- Bun's store layout hides Babel plugins from Metro workers, so the presets Metro needs by name (`@babel/plugin-transform-react-jsx`, `@babel/plugin-transform-typescript`, `@babel/preset-typescript`) are pinned in the root `package.json`, and the css-interop runtime (`react-native-css-interop`, required by NativeWind's JSX runtime) is a direct dependency of the app.
