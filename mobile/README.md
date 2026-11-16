# Surf Game: mobile app (Expo)

The iOS and Android app. It is a full-screen web view that runs the same game as the web
version, with the on-screen touch controls switched on. The game's code is in `../src`; this
folder is only the shell around it.

## Run it on your phone

You need [Node.js](https://nodejs.org) 20 or newer, and the **Expo Go** app from the App Store
or Google Play.

```
cd mobile
npm install
npm start
```

`npm start` first builds the game into one HTML file (`generated/`), then starts Expo and shows
a QR code. Scan it with the phone's camera (iPhone) or from inside Expo Go (Android). The phone
and the computer must be on the same Wi-Fi.

## Build an installable app

With an [Expo account](https://expo.dev) and the EAS command line tool:

```
npx eas-cli@latest build --platform android   # or ios, or all
```

The build makes the game file by itself (the `eas-build-post-install` script).

## How it fits together

| File | What it does |
| --- | --- |
| `App.tsx` | The web view, landscape lock, keep-awake, pause when the app leaves the screen, Android back button pauses |
| `src/bridge.ts` | The few lines of script the app runs inside the game page |
| `generated/gameHtml.js` | The whole game as one string. Made by `npm run game`. Not in git |
| `app.json` | Name, icons, landscape orientation |

The saved game lives in the web view's own storage and stays between runs. It is separate
from a save made in a browser.

## Checks

```
npm run typecheck
npm run export     # bundles the app for Android and iOS, which proves it compiles
```

The game inside the app is tested from the repo root with `npm test` (the `mobile-app` project
loads the same single file the app does, in a phone-sized touch browser).
