# Oatcake for Mac

A small Mac app (built with [Tauri](https://tauri.app)) that opens oatcake.xyz in its own window with
its own Dock icon. It loads the live site, so website updates appear in the app without reinstalling.

What it adds over a browser tab:

- **Dock icon and its own window.** Closing the window keeps Oatcake running so notifications still
  arrive; quit with Cmd+Q.
- **Mac notifications for new client requests.** Macs can't receive web push inside an app like this,
  so `src-tauri/desktop.js` asks `/api/desktop/alerts` once a minute while the app is open.
- **Liquid Glass window.** The window is see-through and frosted (macOS vibrancy) so the wallpaper glows
  through the sidebar and page background; cards stay solid. The site styles it under `html.app-glass`.
- **Drag and drop from Finder** onto the new request form and deliveries.
- **Downloads** (quote PDFs and so on) go straight to the Downloads folder.
- Links to other sites open in the default browser. If the Mac is offline, the app waits and opens
  Oatcake once the connection is back (`offline/index.html`).

## Getting it

GitHub builds the .dmg on every change to `desktop/` (see `.github/workflows/desktop.yml`). Builds
from main are published to the `desktop` release as `Oatcake.dmg`.

The app isn't signed with an Apple Developer ID yet, so the first time it's opened macOS says it
can't check it. Go to System Settings > Privacy & Security and click Open Anyway, once.

## Signing it properly

With an Apple Developer Program membership, add these repository secrets and pass them to the Build
step as environment variables; Tauri signs and notarizes the app when they're present:
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID`.

## Building locally (on a Mac)

```sh
cd desktop
npm ci
npm run build   # needs rustup targets aarch64-apple-darwin and x86_64-apple-darwin
```

`app-icon.png` is the source for the icons; after changing it run `npm run icons`.
