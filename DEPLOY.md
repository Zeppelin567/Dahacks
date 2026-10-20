# Deploy BikeScape

The production website is the integrated `main` branch. It uses a single Docker service for the built React app, Node public-map proxy and loopback-only Python routing service. No account database or LLM key is required.

## Render (free plan)

1. Sign in at https://dashboard.render.com and choose **New → Blueprint**.
2. Connect `blar-tw/Dahacks`, select **main**, and use the root `render.yaml`.
3. Review the proposed `bikescape` web service (Docker, Free), then deploy. Existing Render services must also have their source branch changed to **main**; pushing main does not change a service still tracking demo/refined-map.
4. Render assigns an HTTPS `*.onrender.com` address. Attach a domain in the service settings if desired.
5. Verify the website and a real route using the checks below. `/api/py/health` verifies the Python process, but does not by itself verify the routing graph.

Free instances may sleep and need time to start. No paid plan is selected by this configuration. The lightweight graph loader avoids importing the offline OSMnx/GIS stack into the routing process; monitor actual Linux memory and cold starts on the deployed service before promising an availability target.

## Local production preview

```sh
npm ci
uv sync --frozen --project py
npm run build
PATH="$PWD/py/.venv/bin:$PATH" bash scripts/start-production.sh
```

Open http://localhost:3000. The startup script supervises both processes and exits if either fails. `PORT` defaults to 3000 and is supplied automatically by Render. Python listens on 127.0.0.1:8000 only; Node proxies `/api/py/bikemap/*` and `/api/py/health` without forwarding browser credentials.

## Other Docker hosts

```sh
docker build -t bikescape .
docker run --rm -p 3000:3000 bikescape
```

Place a TLS reverse proxy in front of the container for a public HTTPS URL. The Docker build is verified by GitHub Actions, independently of the native production preview.

## Release verification

```sh
npm run check
npm run test:py
node scripts/smoke-map.mjs https://YOUR-SERVICE.onrender.com
```

The smoke check loads the web page, Node/Python health, places, safe/green routes and both street networks. It checks that routing uses real data, segment voting has feature vectors and recommendations retain the headline guarantees and detour caps.

In a browser, switch Modern/Nature, edit From/To, open More, try presets, vote on a Nature route stretch, add/remove a hazard, run Race, and use Listen on a browser supporting speech. Test a phone viewport too.

Hazards and votes stay on that browser, not a shared server. Photo cards only show images in the private local cache, which the public image deliberately excludes. Scores and routing remain available without images.

For the original starter's database/auth deployment, consult the API code and `.env.example`; those features are not part of the public map container.
