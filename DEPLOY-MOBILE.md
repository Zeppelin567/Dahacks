# BikeMap redesigned web deployment

`demo` keeps the MapLibre Harbor/Nature interface and Race animation while adding the expanded default map, personal preferences and mobile/deployment fixes.

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

## Render

1. Use a GitHub repository that Render can access, with the integrated **demo** branch pushed to it.
2. For a new service choose **New → Blueprint**, that branch, and `render.yaml`. For an existing Blueprint, change its source branch to demo and review the sync; the service's branch is also specified in this file. Pushing demo alone does not switch a service still configured for mobile-web.
3. Review the plan before applying. The Docker image serves the web UI and a lightweight public Node proxy plus the Python routing service at one HTTPS URL. No LLM key is required for baked route scores.
4. Validate both route modes, Race, the added tools and actual route requests after deployment. Health checks alone do not load the graph.

The Docker entrypoint avoids the starter auth/PGlite/LLM stack. `npm start` retains the full original API locally; those starter APIs are not exposed by the map-only deployment. The graph, routing index and display network are initialized under a shared lock to avoid duplicate cold-start allocations. Numerical libraries use one thread. The expanded graph still needs real memory monitoring; this is not a guarantee it will fit a 512 MB free instance. Free instances sleep when idle.

Do not publish cached Street View photos or secrets. Photo cards can show only photos present in the local private cache; absence of photos does not prevent routing. Runtime Docker builds are not verified on a host without Docker.

## Docker on another host

```sh
docker build -t dahacks-bikemap .
docker run --rm -p 3000:3000 --env-file .env.production dahacks-bikemap
```

Set BETTER_AUTH_SECRET (random, at least 16 characters), BETTER_AUTH_URL and WEB_ORIGIN to your HTTPS public origin in that untracked env file. Python listens only on loopback port 8000. Use a TLS reverse proxy for public traffic. `/api/py/health` checks Python availability; also test `/api/py/bikemap/places` and POST `/api/py/bikemap/route`.

## Validation commands

```sh
npm run typecheck
npm test
npm run test:web
npm run build
npm run test:py
```
