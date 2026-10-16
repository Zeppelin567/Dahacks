# VerdantRide (Cupertino): Safe & Nature-Centric Cycling Navigation
## Product & Technical Specification

> **Hackathon Theme:** City Life and Natural Life  
> **Pilot Region:** Cupertino, CA (Centered around De Anza College, Stevens Creek Trail, McClellan Ranch Preserve, and Apple Park)  
> **Target Platform:** Next.js + Mapbox GL JS frontend, Python (FastAPI + NetworkX/OSMnx) backend, Precomputed SQLite / GeoJSON cache  
> **Reference Inspiration:** Aggie Street Smart (HackDavis 2026 Winner)

---

## 1. Executive Summary & Vision

Modern urban navigation directs cyclists along the fastest path, which often channels riders onto noisy multi-lane arterials (e.g., Stevens Creek Blvd) right next to high-speed vehicle traffic. While projects like *Aggie Street Smart* solved bicycle safety through AI road hazard scoring, they overlooked how urban cyclists yearn for **nature immersion, stress relief, and cleaner air**.

**VerdantRide** bridges **city life and natural life**. It gives cyclists the freedom to transition seamlessly between getting to their destination quickly via protected bike infrastructure (**Fast Mode**) and exploring shaded greenways, flowering tree canopies, and tranquil creeks (**Nature Mode**).

### Key Differentiators
1. **Continuous "Fast vs. Nature" Dynamic Slider:** Instead of a rigid binary toggle, riders drag a continuous slider. As the slider moves, the system dynamically re-ranks **8 candidate routes**, re-evaluates their recommendation scores, and updates the map in real time.
2. **Top 8 Graded Paths:** The routing engine computes 8 distinct routes, each graded with clear letter grades for **Safety (A/B/C)** and **Nature (A/B/C)**, featuring an animated **`[Recommended]`** badge on the top pick.
3. **Curiosity Storyboard & Environmental Breakdown:** Riders see exact environmental composition tags:
   - **`% Tree Canopy`** (shade & cooling)
   - **`% River / Creek`** (Stevens Creek water views)
   - **`% Parks & Greenways`** (traffic-free trails)
   - **`% Flowers & Flora`** (seasonal blooms & landscaping)
   Alongside an interactive **Street View Storyboard Tour** that sparks curiosity before the ride.
4. **Google Maps-Style Scattered Destination Discovery:** Before entering a destination, the main map displays scattered recommendation pins biased heavily towards **natural gems** (McClellan Ranch, Blackberry Farm, Memorial Park, Rancho San Antonio) and **frequent routine spots** (De Anza College Library, Apple Park, City Cafes). Any pin launches routes in 1 click.

---

## 2. User Experience & UI Specifications

### 2.1 Main Discovery Map (Pre-Destination State)
* **Visual Style:** High-contrast Mapbox vector map with subtle green tinting over parks and tree canopies.
* **Scattered Destination Pins:**
  * **Natural Escapes (High Nature Score):** Styled with soft emerald glowing markers and nature icons:
    * *McClellan Ranch Preserve* (`🌿 Nature A+ · 9.6`)
    * *Blackberry Farm & Stevens Creek Trail* (`🌊 Nature A+ · 9.4`)
    * *Cupertino Memorial Park & Pond* (`🌸 Nature A · 8.9`)
    * *Linda Vista Park & Foothill Views* (`🌲 Nature A · 8.7`)
    * *Rancho San Antonio County Park (East Access)* (`🦌 Nature A+ · 9.8`)
  * **Frequent / Everyday Spots:** Styled with sleek slate/blue badges:
    * *De Anza College Library & Campus Center* (Frequent Routine)
    * *Main Street Cupertino & Philz Coffee* (Frequent Routine)
    * *Apple Park Visitor Center & Caffe Macs* (City Landmark)
* **Search Bar:**
  * Always accessible at the top.
  * Allows free-text search for any location (e.g., "City Cafe", "Whole Foods", "Cupertino Library"). Commercial places remain fully searchable even if not highlighted on the initial map view.
* **1-Click Route Launcher:**
  * Clicking any pin immediately sets it as the destination from the user's current location (defaulting to De Anza College Quad) and launches the 8-route preview drawer.

### 2.2 Route Comparison & Interactive Slider Drawer
* **The Continuous Dynamic Slider:**
  * Positioned prominently above the route list:
    ```
    [ ⚡ Fast & Safe ] ═══════════●════════════ [ 🌿 Lush Nature ]
         (0% Arterial)           (50% Balanced)         (100% Scenic)
    ```
  * As the rider slides the handle:
    * The overall utility score for each route recalculates live.
    * The 8 routes dynamically re-sort smoothly using FLIP CSS transitions.
    * The **`[★ Recommended]`** badge floats to the newly crowned #1 route.
    * The highlighted path on the Mapbox canvas updates its stroke glow.
* **Route Card Component (Top 8 Paths):**
  Each of the 8 route cards presents:
  1. **Rank & Recommendation Badge:** E.g., `#1 · Recommended` (emerald pill with pulse glow).
  2. **Route Name / Persona:** E.g., *"Stevens Creek Greenway & Blackberry Path"* or *"McClellan Buffered Bike Corridor"*.
  3. **ETA & Distance:** E.g., `18 min · 3.4 mi` (vs. Fast route: `12 min · 2.6 mi`).
  4. **Dual Letter Grades:**
     * **Safety Grade:** `Grade A` (emerald), `Grade B` (amber), `Grade C` (orange).
     * **Nature Grade:** `Grade A+` (forest green), `Grade B` (teal), `Grade C` (slate).
  5. **Environmental Composition Tags:**
     * `🌿 82% Canopy`
     * `🌊 45% Creek Proximity`
     * `🌸 25% Flora & Gardens`
     * `🚴 90% Dedicated Bike Path`
  6. **Safety Hazards / Notes:** E.g., *"Zero door-zone exposure; fully separated grade"*.

### 2.3 Curiosity Storyboard & Route Preview Tour
* Riders click **"Preview Ride / Storyboard"** on any route card:
* A modal / side-drawer opens with an interactive street-by-street slideshow:
  * Plays sampled Google Street View imagery along the path in forward sequence.
  * **AI Storyboard Annotations:**
    * *Mile 0.8:* `"Entering shaded sycamore canopy along Stevens Creek — temperature drops ~4°F"`
    * *Mile 1.4:* `"Blackberry Farm Nature Path — blooming California poppies & creek soundscape"`
    * *Mile 2.1:* `"Smooth paved Class I bike trail, no cross traffic for next 1.2 miles"`
  * Allows cyclists to build confidence and excitement before clipping in.

---

## 3. Data Pipeline & Scoring Architecture

```
┌────────────────────────────────────────────────────────┐
│  OpenStreetMap (OSM) via Overpass API / OSMnx          │
│  - Road Network, Bike Lanes, Speed Limits, Surface     │
│  - Leisure (Parks), Natural (Wood, Tree Rows), Waterway │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Spatial Sampling & Google Street View Imagery Pipeline │
│  - Sample points every 80m along bikeable edges        │
│  - Intersection nodes (4-angle views)                  │
│  - Street View Metadata API Check & Local Disk Cache   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Gemini 1.5 / 2.0 Multimodal Environmental & Safety AI  │
│  - Evaluates Street View photos + OSM segment context  │
│  - Outputs structured JSON (Nature & Safety Scores)    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  Precomputed SQLite & GeoJSON Database (Cupertino Grid)│
│  - Edge ID, Safety Score, Nature Score, Canopy %,      │
│  - Water %, Flower %, Hazard Tags, Geometry            │
└────────────────────────────────────────────────────────┘
```

### 3.1 OpenStreetMap (OSM) Road & Green Network
* Bounding Box: Cupertino and adjacent corridors (lat: `37.2900` to `37.3500`, lon: `-122.0800` to `-122.0100`).
* Extracted tags:
  * Highway classification: `cycleway`, `path`, `residential`, `tertiary`, `secondary`.
  * Bike infrastructure: `cycleway=lane`, `cycleway=track`, `cycleway=separate`, `bicycle=designated`.
  * Environmental proximity: distance to `leisure=park`, `leisure=nature_reserve`, `waterway=stream` (Stevens Creek), `natural=tree_row`.

### 3.2 Google Street View Sampling & Cache
* To prevent duplicate API charges and rate limiting:
  1. Call Google Street View **Metadata API** (free) to verify imagery exists within 50m.
  2. Download front-facing (`fov=90`, `heading=forward`) and side-facing (`heading=right` toward bike lane/verge) images.
  3. Store images hashed by `(lat, lon)` in `.cache/streetview/`.

### 3.3 Gemini Multimodal Environmental & Safety Scoring
Each sampled segment passes its Street View image plus known OSM facts into Gemini with a strict schema.

#### Gemini System Prompt:
```text
You are an expert urban cyclist and environmental scientist evaluating street segments for bicycle navigation.
You are given:
1. One or more street-level photographs of a road or path.
2. Known metadata (speed limit, lane count, road type from OpenStreetMap).

Evaluate both the CYCLING SAFETY (1-10) and the NATURAL IMMERSION (1-10).

SAFETY RUBRIC:
- 9-10: Fully separated off-street bike path / greenway, physical barriers from cars.
- 7-8: Dedicated painted bike lane on quiet residential street or wide buffered lane.
- 5-6: Bike lane adjacent to curbside parking (door zone hazard), or wide shared lane.
- 3-4: Multi-lane busy road without bike lane, fast vehicle traffic (>35mph).
- 1-2: Extremely hazardous, narrow, freeway on-ramps, heavy commercial trucks.

NATURE RUBRIC:
- 9-10: Surrounded by dense nature, creek/river corridor, dense tree canopy (>70%), parks, or flowering landscaping; minimal or no visible concrete/buildings.
- 7-8: Tree-lined residential street with mature canopy, manicured gardens, or adjacent to a neighborhood park.
- 5-6: Occasional young trees or street shrubs, predominantly suburban streetscape.
- 3-4: Concrete-dominated commercial strip with sparse or no vegetation.
- 1-2: Industrial zone, parking lots, bare asphalt, heavy traffic exhaust.

Return strictly valid JSON according to the schema provided.
```

#### JSON Output Schema:
```json
{
  "safety_score": 8.5,
  "safety_grade": "A",
  "nature_score": 9.2,
  "nature_grade": "A+",
  "canopy_pct": 75,
  "water_visible": true,
  "greenery_types": ["dense_trees", "creek", "wildflowers"],
  "hazards": [],
  "safety_summary": "Protected Class I multi-use path separated from motor vehicles.",
  "nature_summary": "Lush riparian tree canopy along Stevens Creek with blooming roadside vegetation.",
  "storyboard_highlight": "Shaded creek-side path under dense eucalyptus and sycamore branches."
}
```

---

## 4. Multi-Objective Routing Algorithm

### 4.1 Cost Function Formulation
For each directed edge $e$ in the bike network graph $G = (V, E)$, the base metric is physical length $L(e)$ in meters.

Each edge has:
- $S(e) \in [1.0, 10.0]$: Safety score (higher is safer).
- $N(e) \in [1.0, 10.0]$: Nature score (higher is greener).
- $W_{slider} \in [0.0, 1.0]$: The user's dynamic slider value ($0.0 = \text{Fast}$, $1.0 = \text{Nature}$).

We define the perceived felt resistance cost $C(e, W_{slider})$:

$$C_{safety}(e) = L(e) \times \left(1.0 + \alpha \times \left(10 - S(e)\right)^{1.8}\right)$$

$$C_{nature}(e) = L(e) \times \left(\frac{1.0}{1.0 + \beta \times (N(e) - 1.0)}\right)$$

$$\text{Combined Cost } C(e) = (1 - W_{slider}) \cdot C_{safety}(e) + W_{slider} \cdot \left[ C_{nature}(e) \times P_{safety\_floor}(S(e)) \right]$$

Where:
* $P_{safety\_floor}(S(e))$ is a safety guardrail multiplier: if $S(e) < 5.0$, a steep penalty ($3.0\times$) is applied so Nature Mode never routes riders onto dangerous highways just because trees line the shoulder.
* $\alpha, \beta$ are scaling constants calibrated to allow up to a 25%–40% pleasant detour in Nature Mode.

### 4.2 Generating 8 Meaningfully Distinct Routes
To prevent 8 nearly identical paths with minor 10-meter detours:
1. **Pareto Weight Sampling:** We evaluate graph traversals across 5 distinct cost weight profiles:
   - Profile 1: Pure Shortest & Safest (Direct Class I/II Bike Lanes)
   - Profile 2: Balanced Commute (70% Safety / 30% Nature)
   - Profile 3: Scenic Greenway (Blackberry Farm & Stevens Creek Trail bias)
   - Profile 4: Park-to-Park Wanderer (Cupertino Memorial & Linda Vista anchor)
   - Profile 5: Maximum Canopy & Quiet Residential
2. **Yen's K-Shortest Paths with Overlap Penalty (Penalty Method):**
   - When path $P_k$ is found, we increase edge costs along edges in $P_k$ by an overlap penalty factor $\gamma = 1.6$.
   - This forces subsequent paths to discover alternative green corridors (e.g., McClellan Rd bike boulevard vs. Stevens Creek Trail vs. Bollinger Rd bike lane).
3. **Route Deduplication & Ranking:**
   - Filter out routes with $>80\%$ geometric Jaccard similarity.
   - Retain the top 8 distinct routes.
   - Score each route on overall distance, duration, average safety score, and average nature score.
   - Assign Letter Grades:
     - $\ge 9.0$: **A+**
     - $8.0 - 8.9$: **A**
     - $7.0 - 7.9$: **B**
     - $6.0 - 6.9$: **C**
     - $< 6.0$: **D**

---

## 5. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14 / React)                   │
│                                                                        │
│  - Mapbox GL JS Canvas (Vector Tiles, Dynamic GeoJSON Layers)          │
│  - Dynamic Slider Component (0-100% Fast vs. Nature)                   │
│  - 8-Route List with Letter Grades (A/B/C) & [Recommended] badge      │
│  - Route Storyboard Modal (Street View Tour + Curiosity highlights)    │
│  - Scattered Suggested Destination Pins & Search Autocomplete          │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ HTTP / JSON API
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       BACKEND (FastAPI - Python)                       │
│                                                                        │
│  - GET /api/destinations/suggested   (Scattered natural + frequent POIs)│
│  - POST /api/routes/calculate        (Returns 8 distinct graded paths)  │
│  - GET /api/routes/{id}/storyboard   (Street View sequence + AI notes)  │
│  - GET /api/search?q={query}         (Mapbox / OSM Geocoder proxy)      │
│                                                                        │
│  Engine Modules:                                                       │
│  - `app/routing/multi_graph.py`      (NetworkX graph + Yen's k-paths)   │
│  - `app/scoring/gemini_agent.py`     (Multimodal environmental rater)   │
│  - `app/data/cupertino_cache.sqlite` (Precomputed network & scores)    │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Backend Endpoints

#### `POST /api/routes/calculate`
* **Request:**
  ```json
  {
    "origin": { "lat": 37.3195, "lng": -122.0450 },
    "destination": { "lat": 37.3140, "lng": -122.0680 },
    "slider_nature_pct": 75
  }
  ```
* **Response:**
  ```json
  {
    "recommended_route_index": 0,
    "slider_nature_pct": 75,
    "routes": [
      {
        "id": "route_greenway_creek",
        "name": "Stevens Creek Trail & Blackberry Farm Way",
        "distance_meters": 4920,
        "duration_seconds": 1080,
        "safety_score": 9.4,
        "safety_grade": "A",
        "nature_score": 9.6,
        "nature_grade": "A+",
        "tags": {
          "canopy_pct": 82,
          "river_creek_pct": 64,
          "parks_pct": 58,
          "flowers_pct": 28
        },
        "geojson": { "type": "LineString", "coordinates": [...] },
        "elevation_gain_m": 24,
        "storyboard_count": 6
      },
      ... // 7 more routes
    ]
  }
  ```

#### `GET /api/destinations/suggested`
Returns pre-populated scattered map pins around Cupertino:
* 5 Nature Escapes (McClellan Ranch, Blackberry Farm, Memorial Park, etc.)
* 3 Frequent Spots (De Anza Library, Apple Park Visitor Center, Main St Cupertino)

---

## 6. Cupertino Pilot Area & Demo Route Scenarios

### 6.1 Geographic Anchors
* **Center Point:** De Anza College (`37.3195° N, -122.0450° W`)
* **Key Nature POIs:**
  1. *McClellan Ranch Preserve & Nature Museum* (`37.3140° N, -122.0680° W`) — historic ranch, tree preserve, quiet walking/cycling connection.
  2. *Blackberry Farm Park* (`37.3130° N, -122.0635° W`) — creek-side trail, picnic grounds, dense tree canopy.
  3. *Stevens Creek Trail Corridor* (`37.3160° N, -122.0590° W`) — continuous protected trail along the stream.
  4. *Cupertino Memorial Park* (`37.3240° N, -122.0400° W`) — large lake/pond, landscaped amphitheater, flowers.
  5. *Linda Vista Park* (`37.3300° N, -122.0600° W`) — community park, scenic foothill vistas.
* **Key City Life POIs:**
  1. *Apple Park Visitor Center & Campus* (`37.3328° N, -122.0053° W`) — iconic architecture, sleek modern city contrast.
  2. *Main Street Cupertino* (`37.3235° N, -122.0150° W`) — dining, retail, bike hub.
  3. *De Anza College Library & Campus Center* (`37.3195° N, -122.0450° W`) — student commute center.

### 6.2 The Hackathon Demo Script (3-Minute Winning Pitch)
1. **Act 1: The Dilemma (30s):**
   * "Today, when students at De Anza College bike across Cupertino, standard navigation pushes them onto Stevens Creek Blvd—fast, but loud, car-heavy, and stressful. What if your bike route prioritized your mental well-being and natural connection without sacrificing safety?"
2. **Act 2: The Map & Discovery (45s):**
   * Show VerdantRide's Cupertino map with scattered Google Maps-style recommendation pins highlighting both everyday routines (De Anza Library) and natural gems (McClellan Ranch Preserve).
   * 1-Click on McClellan Ranch: The app immediately computes **8 distinct routes**.
3. **Act 3: The Interactive Continuous Slider (60s):**
   * Start at **Fast Mode (0%)**: Route #1 is the fastest direct path via McClellan Rd bike lane. Safety Grade: A, Nature Grade: B-.
   * Drag the slider toward **Nature Mode (100%)**:
     * Watch the cards dynamically re-rank!
     * Route #3 (Stevens Creek Trail & Blackberry Farm) rises to #1 with an animated `[Recommended]` badge!
     * Grade: Nature A+, 82% Shaded Canopy, 64% Creek Proximity, with zero car door hazards.
4. **Act 4: Curiosity Storyboard (30s):**
   * Open the Storyboard Tour: Show Street View snapshots annotated with Gemini's vision analysis highlighting the shaded sycamores and stream views.
5. **Act 5: Real-World Resilience (15s):**
   * Highlight that the entire Cupertino network is precomputed and cached in SQLite/GeoJSON for instant zero-latency demoing, with live API connectivity.

---

## 7. Implementation Roadmap

### Phase 1: Data & Graph Setup
- [ ] Extract Cupertino bike network via OSMnx into NetworkX graph.
- [ ] Implement sampling points (80m) + Street View metadata checking.
- [ ] Build Gemini vision prompt and precompute ~150 key Cupertino street segments into local SQLite/GeoJSON cache.

### Phase 2: Multi-Objective Routing Engine
- [ ] Implement dual cost functions ($C_{safety}$ and $C_{nature}$).
- [ ] Implement Yen's k-shortest paths with edge penalties to yield 8 distinct routes.
- [ ] Compute route letter grades (A/B/C) and tag percentages (% canopy, % creek, % flowers).

### Phase 3: Frontend Web Application
- [ ] Scaffold Next.js application with Mapbox GL JS integration.
- [ ] Implement scattered suggestion map pins (Google Maps style) with 1-click launcher.
- [ ] Build the interactive dynamic continuous slider with smooth list re-ordering.
- [ ] Build route cards with dual badges (Safety + Nature) and `[Recommended]` indicator.
- [ ] Build the Curiosity Storyboard modal for Street View preview tours.

### Phase 4: Polish & Hackathon Presentation
- [ ] Add smooth CSS micro-interactions and glowing route vectors.
- [ ] Verify offline demo mode resilience.
- [ ] Package project documentation, Devpost submission copy, and presentation script.
