# Setup Notes

Decisions and version-specific adjustments made while scaffolding the
foundation. Useful context for whoever continues the build.

## Expo SDK 54 (matched to Expo Go)

The project targets **Expo SDK 54** (React 19.1, React Native 0.81, Reanimated 4,
TypeScript 5.9).

It was originally scaffolded by `create-expo-app@latest`, which produced **SDK 56**
(React 19.2 / RN 0.85). But the public **Expo Go app on the App Store ships SDK 54**
— SDK 56 gave a _"Project is incompatible with this version of Expo Go"_ error on
device. Since on-device testing via Expo Go is a hard requirement, the project was
**downgraded to SDK 54** with:

```bash
npm install expo@~54.0.0
npx expo install --fix   # snaps react, react-native and all expo-*/react-native-* to SDK 54
```

If a future Expo Go release bumps the supported SDK, you can upgrade again the same
way (`npm install expo@~55/56` + `expo install --fix`).

## gluestack-ui (v5 alpha) + NativeWind v5 (preview)

`npx gluestack-ui init` was run with `--nativewind`. It installs:

- **gluestack-ui v5 (alpha)** — `@gluestack-ui/core`, `@gluestack-ui/utils`
- **NativeWind v5 (preview)** + **Tailwind v4**

This is newer than the "stable" gluestack-ui v2 / NativeWind v4 combo, but it is
what the official tooling installs, and NativeWind v5 is the version built for
React 19 / the new architecture (v4 predates it). It bundles cleanly on SDK 54.
The trade-off is that these are **alpha/preview** releases; pin versions
deliberately before shipping to production.

Tailwind v4 has **no `tailwind.config.js`** — the theme lives in
[`src/global.css`](../src/global.css) via `@theme`. Semantic tokens
(`bg-background`, `text-foreground`, `text-muted-foreground`, …) are defined
there for light and dark, so our `AppScreen`/`AppText` adapt to the color scheme
automatically.

## Adjustments to the generated setup

- **Babel** ([babel.config.js](../babel.config.js)): the gluestack init added a
  `babel-plugin-module-resolver` aliasing `@` → project root, which conflicts
  with the Expo template's `@` → `src` (tsconfig paths, resolved natively by
  Expo's Metro). Removed the module-resolver entirely and rely on tsconfig
  paths. Also removed the manual `react-native-worklets/plugin` — it is injected
  automatically by `babel-preset-expo`.
- **GluestackUIProvider**
  ([src/components/ui/gluestack-ui-provider/index.tsx](../src/components/ui/gluestack-ui-provider/index.tsx)):
  the generated `system` handling forced an invalid color scheme. Changed it to
  leave `Appearance` untouched for `system` (so it follows the device) and only
  force light/dark explicitly. `_layout.tsx` uses `mode="system"`.
- **Root layout** ([src/app/_layout.tsx](../src/app/_layout.tsx)): rewritten —
  gluestack had wired it to the template's example components, which we removed.
  Note: on SDK 54 the navigation theme helpers (`DarkTheme`, `DefaultTheme`,
  `ThemeProvider`) come from `@react-navigation/native`, not `expo-router`.
- **`*.css` types** ([global.d.ts](../global.d.ts)): added
  `declare module '*.css';` so `import '@/global.css'` type-checks (NativeWind v5
  augments `className` typing but not CSS module imports).

## ESLint

- Pinned **ESLint to v9** (`eslint@^9`). `eslint-config-expo` bundles an
  `eslint-plugin-react` that uses `context.getFilename()`, which **ESLint 10
  removed** — v10 throws on lint. ESLint 9 + flat config + `eslint-config-prettier`.

## Other

- **Dev server skips the version check (Node 22 bug).** On Node 22 the
  `@expo/cli` online dependency-version check crashes with `TypeError: Body is
unusable: Body has already been read` (undici reads the fetch body twice). The
  dev scripts set `EXPO_NO_DEPENDENCY_VALIDATION=1` (via `cross-env`), which makes
  the CLI skip that check while staying **online** — so normal LAN device
  connection and `npm run tunnel` work. (`npm run start:offline` is also
  available.) Remove the env var once a fixed `@expo/cli` ships.
- **`npm run tunnel`** routes through ngrok (installed on first use) and bypasses
  LAN/router isolation — the fix when Expo Go reports "request timed out" on LAN.
- **`@expo/vector-icons`** was not in the original default template, so it was
  installed explicitly (used for the tab bar icons).
- **`.npmrc`** sets `legacy-peer-deps=true` (added by gluestack init). The
  alpha/preview packages declare strict peer ranges that otherwise make a clean
  `npm install` fail; keep this file until those packages stabilize.
- `npm install` reports ~13 moderate transitive advisories — typical for the RN
  toolchain and not blocking; revisit before production.
- `babel-plugin-module-resolver` remains in devDependencies but is unused (the
  Babel module-resolver was removed); safe to drop later.

## Verified

`npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` (18/18) and a production
iOS JS bundle (`npx expo export`) all pass on SDK 54. Runtime behavior on a
physical device via Expo Go has **not** been exercised from this environment — do
a quick smoke test on your iPhone (Expo Go 54.x).
