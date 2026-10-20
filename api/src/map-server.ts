// Production entrypoint: the public map and Python proxy share one origin.
import { serve } from "@hono/node-server";
import { env } from "./env";
import { mapApp } from "./map-app";

serve({ fetch: mapApp.fetch, hostname: "0.0.0.0", port: env.PORT }, () => {
  console.log(`BikeScape listening on 0.0.0.0:${env.PORT}`);
});
