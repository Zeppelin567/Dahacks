# Demo script: BikeMap Cupertino

Two routes, one per mode, chained into one story. Every number below was measured on 2026-10-16 at 20:30 against branch `fix/routing` (commit `8b15384`), through the engine that the API serves.

| | Modern (safe) | Nature (green) |
|---|---|---|
| Trip | **Apple Infinite Loop → Cupertino Library** | **Cupertino Library → Main Street Cupertino** |
| Fastest / Direct | 7.6 min, straight down De Anza Blvd, **4 risky spots** | 8.5 min along Stevens Creek Blvd, **42% green** |
| Recommended | 7.7 min on parallel side streets, **0 risky spots** | 9.4 min down the **Regnart Creek Trail past Wilson Park**, **80% green** |
| Cost | **+6 seconds** | **+0.9 min** |
| Backup | Blackberry Farm → Cupertino High: 2 → 0 risky, +0.3 min | Library → Apple Park: 46% → 74% green, +1.4 min |

## Before you go on stage

1. **Run the right branch.** Use `demo`, merged with `fix/routing` at `8b15384` or later. That commit makes the risky count match what is drawn red.
2. **Start both servers** and open the app:
   ```
   npm run dev:py
   npm run dev
   ```
3. **Warm the server:** run each demo trip once. The first route request builds the index (about 0.5–1 s); after that, routes take about 10–25 ms.
4. **Street photos** (the detail card and the Nature photo strip) show only on the laptop that has `py/data/cache/streetview/`. Present from that laptop, or skip the photos.
5. **UI items to confirm with the UI team before the demo:**
   - **Draw the fastest route.** Draw it as a thin grey line with its red pieces on top: `fastest.segments.filter(s => s.level === "bad")`. Without this, the Safe contrast is only spoken, not seen.
   - **Show the comparison.** `compare.extra_min` and `risky_segments_fastest → risky_segments_recommended` (Safe), or `greenery_pct_fastest → greenery_pct_recommended` (Green).

## Demo 1: Modern mode (safe), about 60 s

| Step | Do | Screen | Say |
|---|---|---|---|
| 1 | Modern mode. Turn on **Show risk on every street**. | City map: arterials orange, neighbourhoods green, red at expressways and the worst junctions | "Claude looked at 8,931 street photos and rated every street in Cupertino. Green is calm, orange is stressful, red is where most people won't ride." |
| 2 | Click **De Anza Blvd** near Infinite Loop. | Card: "Painted bike lane on a five-lane road… traffic is busy" + "Cars pass at 40 mph or more" | "Every colour has a reason. This one is Claude's own note from the photo." |
| 3 | From **Apple Infinite Loop**, To **Cupertino Library / Civic Center**. | Recommended route on quiet parallel streets. Fastest (if drawn) straight down De Anza | "Google would send you straight down De Anza: six lanes at 40 mph, and four risky crossings." |
| 4 | Click a red spot on the fastest route (if drawn), or on the map at De Anza × Stevens Creek. | "Risky intersection: scored 2/10 from street photos" + "Signalised crossing of a wide, fast arterial…" | "That's a 2 out of 10 crossing." |
| 5 | Point at the comparison. | **Risky 4 → 0, +0.1 min** | "Our route avoids all four, for six extra seconds." |

**Fallback:** if a route is slow or the server hiccups, swap From and To. Library → Infinite Loop gives 1 → 0 risky for +0.5 min.

## Demo 2: Nature mode (green), about 60 s

| Step | Do | Screen | Say |
|---|---|---|---|
| 1 | Switch to **Nature**. Keep **Greenery + Quiet** on. Set the slider to **Direct** (all the way left). | Parks, creeks and trees appear | "Same city, other half of the theme: can a city ride feel like a country ride?" |
| 2 | From **Cupertino Library**, To **Main Street Cupertino**. | Direct route along Stevens Creek Blvd, **42% green**, 8.5 min | "At Direct, distance is all that counts. That's the modern commute." |
| 3 | Drag the slider **slowly** toward **Scenic**. The route changes in the first fifth of the slider (at about 0.05 and 0.15), so go slowly there. | The route leaves Stevens Creek, then bends onto the **Regnart Creek Trail past Wilson Park** | "As I slide toward Scenic, bare streets start to feel longer than tree-lined ones, so the route bends into the creek trail." |
| 4 | Leave it at Scenic. | **80% green, 9.4 min (+0.9 min)** | "Nearly double the greenery for under a minute, and it never puts you on a dangerous road for the sake of trees." |
| 5 | Optional: click a green stretch. | Claude's green note, e.g. "Tall mature trees line both sides of this residential street" | "Claude rated the greenery from the same photos, in a separate call." |

**Toggles, if a judge asks.** At Scenic on this trip:
- Quiet only: 9.9 min, 98% green.
- Greenery only: 9.4 min, 62% green.
- All three on: 10.2 min, 71% green.

Every combination still leaves the arterial.

**Fallback:** the reverse trip (Main Street → Library) gives 50% → 80% green for +0.8 min. Library → Apple Park changes most gradually: 5 distinct routes, 46% → 74%.

## Numbers to say (all verified)

| Number | What |
|---|---|
| 8,931 photos, $0 | Street View photos, all inside Google's free tier |
| 10,959 Claude calls, $2.38 | Claude Haiku 5.5 scored every photo spot twice, once for safety and once for greenery |
| 95% | Share of drivable street length scored from photos (the rest from map rules) |
| 688 → 63 | Safe-map colour flips along the same street, before → after the map clean-up (−91%) |
| ~25 ms | Time per route (p95) after the routing fix; it was ~180 ms before |
| 4 → 0 risky, +6 s | Demo 1 |
| 42% → 80% green, +0.9 min | Demo 2 |

## If judges push back

- **"Is safe the same as no crashes?"** No. The score measures traffic stress (Level of Traffic Stress, an engineering standard). We have not run the crash-data check yet, so we don't claim a crash reduction.
- **"Are Claude's scores right?"** Map facts (speed, lanes, bike lanes) go in as facts, and the output is a fixed form with 17 fixed hazard types. A 20-spot test caught one error (lanes out of the camera's view), and we fixed the prompt. Expressways come out 1–2, quiet streets 8–9.
- **"Google's terms?"** Be honest. The photos are never committed to the public repo, and we store only panorama IDs and scores. Google's terms don't allow showing Street View images next to a non-Google map, so the in-app photos are a local demo only. A production version would switch to an openly licensed imagery source such as Mapillary.
