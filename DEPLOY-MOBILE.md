# BikeMap redesigned web deployment

`main` keeps the MapLibre Harbor/Nature interface and Race animation while adding the expanded default map, personal preferences and mobile/deployment fixes.

## Use the integrated features

- Open **More** below the route comparison. In Nature mode, choose **Fastest**, **Balanced**, **Max nature**, or use the continuous scenic slider. Existing Greenery/Quiet/Shade chips still apply.
- Tap a Nature route stretch and use **More like this** / **Less like this** in its street card. Votes adjust feature weights for the next route; **Reset stretch votes** clears them. Presets also clear previous votes. Disabled features stay disabled. Direct mode still prioritizes distance.
- **Listen to route** in More, or **Listen** in Try it, speaks a route overview and stops when the selected route changes. It is not GPS-triggered turn guidance.
- **Report a hazard** in More or **Report** in Try it, then tap the map, select a category and save. Tap the orange marker to inspect/remove it. Reports do not modify routing.
- Votes and hazards stay in localStorage on that browser; existing records from mobile-web are reused. They are not shared between devices.
- Phones retain the redesigned bottom sheet and swipe/More interaction, with safe-area spacing, larger touch targets and landscape scrolling. Both modes, Race, search, endpoint selection and details remain available.

## Local preview

```sh
npm ci
npm run dev
```

This starts Node, Vite and Python (requires uv). `npm run dev:js` starts only Node/Vite. The normal local URL is http://localhost:5173. The default graph includes Cupertino and the south-east extension bounded by I-280, San Tomas Aquino Rd and Prospect Rd / Hamilton Ave. Search uses the expanded bounding box.

## Deployment

The integrated production branch is now **main**. See [DEPLOY.md](DEPLOY.md) for the current Render Blueprint, Docker entrypoint and live route verification.

## Validation commands

```sh
npm run typecheck
npm test
npm run test:web
npm run build
npm run test:py
```
