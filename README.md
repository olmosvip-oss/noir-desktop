# Noir for Mac

The Noir desktop app. It opens [noirmusic.shop](https://noirmusic.shop) in its own native window, with a Dock icon, menus, keyboard media keys, desktop notifications, `noir://` links and automatic updates.

Because the app loads the live site, every Publish in Lovable shows up in the app instantly. You only make a new app release when you change this repo (icon, menus, app behavior).

## One-time setup: GitHub secrets

In this repo: **Settings → Secrets and variables → Actions → New repository secret**. Add these five:

| Secret | What it is |
|---|---|
| `MAC_CERT_P12_BASE64` | Your **Developer ID Application** certificate, exported from Keychain Access as a `.p12`, then base64-encoded (see below) |
| `MAC_CERT_PASSWORD` | The password you set when exporting the `.p12` |
| `APPLE_API_KEY_P8` | The full text of your App Store Connect API key file (`AuthKey_XXXXXXXXXX.p8`), including the BEGIN/END lines |
| `APPLE_API_KEY_ID` | The key's ID (the `XXXXXXXXXX` part of the file name) |
| `APPLE_API_ISSUER` | The Issuer ID shown at the top of the App Store Connect keys page |

**Export the certificate:** open Keychain Access → My Certificates → right-click **Developer ID Application: …** → Export → save as `noir.p12` with a password. Then in Terminal:

```
base64 -i noir.p12 | pbcopy
```

That copies it. Paste it as `MAC_CERT_P12_BASE64`.

**Create the API key:** [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API → Team Keys → **+** (Access: Developer). Download the `.p8` once (Apple only lets you download it once).

## Make a release

1. Bump `version` in `package.json` (e.g. `1.0.1`).
2. Create a GitHub release with a new tag like `v1.0.1` (or push the tag).
3. The **Build Noir for Mac** action signs, notarizes and publishes `Noir.dmg` to the release. Installed apps update themselves.

Download link that always points to the newest version:

```
https://github.com/olmosvip-oss/noir-desktop/releases/latest/download/Noir.dmg
```

To test a signed build without publishing: **Actions → Build Noir for Mac → Run workflow**. The `.dmg` appears as a download on that run.

## Run locally

```
npm install
npm start
```
