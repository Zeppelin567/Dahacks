# BikeScape (DAHacks 5.0)

BikeScape compares fast, safer and greener bicycle routes around Cupertino and its south-east extension. `main` integrates the final `presentation` website with the team's ride tools.

## Features

- One MapLibre map with Modern (safe) and Nature (green) modes, editable From/To, place search, dropped pins, shared trip links and 2D/3D views.
- Fastest versus recommended routes, route colours per stretch, risky-crossing details, green layers, trees along the route and the Race animation.
- Fastest / Balanced / Max nature presets, continuous scenic preference, Greenery / Quiet / Shade toggles and More/Less-like-this segment voting.
- Spoken route overview, plus hazard markers with categories, notes and removal. Votes and hazards are stored in the current browser; hazards do not alter route calculations. Speech does not track GPS position.
- The baked graph and scores work without an LLM key. Street View photo cards require the private, untracked photo cache; public deployments retain the scores and map details without it.

Greenery means a length-weighted vegetation score, not measured canopy coverage. Recommendations retain the routing detour cap and must not score worse than the fastest route on the displayed headline metric.

## Run locally

Requires Node >=22.12 and [uv](https://docs.astral.sh/uv/).

```sh
npm ci
uv sync --frozen --project py
npm run dev
```

Open http://localhost:5173. `npm run dev:js` starts only Node/Vite. `npm run dev:py` starts the routing service separately.

## Verify

```sh
npm run check       # active app lint, types, API + web tests, production build
npm run test:py     # routing, graph loading, feature contracts
```

The standalone presentation source and its original assets remain in `presentation/`. It is maintained separately from the public map: `npm --prefix presentation ci && npm --prefix presentation run dev` opens the deck on :5174 while the live website runs on :5173. The root lint/check targets the production app; it does not reformat the archived presentation copy or generated assets.

## Deploy

See [DEPLOY.md](DEPLOY.md). The Render Blueprint deploys **main** as one Docker service: the built map, a public Node proxy and Python routing, at one HTTPS address. No database or paid API key is needed for the map.

The original starter's authenticated APIs remain available through `npm start`; the public container exposes only map APIs. Integration decisions and branch coverage are recorded in [INTEGRATION.md](INTEGRATION.md).

## Data and development

- `web/`: React/Vite map and riding tools.
- `api/`: Hono proxy, original starter APIs and tests.
- `py/app/bikemap/`: routing, scoring and map endpoints.
- `py/data/`: the committed baked graph and scores, including the extended area.
- `py/scripts/`: offline graph/photo/scoring pipeline, using OSMnx.
- [Scoring specification](.plans/scoring-spec.md), [technical plan](.plans/actualproject.md), [backend explanation](docs/backend-story.md).

Photos, raw model replies and keys are excluded from the public runtime image. Do not regenerate the graph to deploy an existing scored map.

Built on [MVP_demo](https://github.com/blar-tw/MVP_demo), an MIT starter written before the event. BikeScape map/routing features were built during DAHacks 5.0. See [LICENSE](LICENSE).
