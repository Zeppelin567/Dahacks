# BikeMap mobile web deployment

The `mobile-web` branch keeps the desktop map and all route features. Phones use the same URL: open **Plan & compare routes** for preferences, presets, comparison and speech; tap a street or destination to show its details. Close a panel to return to the map. Route planning covers the committed Cupertino graph, not the whole world.

## Public HTTPS URL (Render)

1. Push this branch to GitHub. In your Render account, choose **New → Blueprint**, select `blar-tw/Dahacks` and the **mobile-web** branch, and use `render.yaml`.
2. Review the free plan and create the service. The Docker image builds the web UI and starts both the Node API and required Python routing service. No LLM key is needed for bike routing.
3. After the health check passes, use the HTTPS URL shown in the Render dashboard on desktop and phone. Render supplies the public origin automatically; no localhost address should be shared with phones.
4. Check both modes, change endpoints, compare routes, tap a street and test location permission on an actual phone. Location requires HTTPS and a position near the supported map area. Speech support depends on the browser.

This configuration is prepared for deployment; it does not create a Render account or guarantee a public URL until a deployment succeeds. Free instances sleep and may have a slow first request; upgrade resources if the graph exceeds the free memory allowance. GitHub Pages alone cannot execute the required Python routing service.

Embedded database contents are ephemeral on this free configuration. For persistent accounts or starter CRUD data, set DATABASE_URL to a managed PostgreSQL connection. Hazard reports and segment voting remain local to each browser as before. A home-screen bookmark can be added using the browser Share/Add to Home Screen menu; route calculation requires internet access.

## Docker on another host

```sh
docker build -t dahacks-bikemap .
docker run --rm -p 3000:3000 --env-file .env.production dahacks-bikemap
```

Set BETTER_AUTH_SECRET (a random secret of at least 16 characters), BETTER_AUTH_URL and WEB_ORIGIN to your public HTTPS origin in that untracked env file. Put a TLS reverse proxy in front of port 3000. Python stays private on loopback port 8000. `/api/py/health` checks the routing process; exercise `/api/py/bikemap/places` and an actual route after deployment because the graph loads lazily.
