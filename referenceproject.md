# Aggie Street Smart: Feature Breakdown

Regular navigation finds the fastest route. Aggie Street Smart finds the safest one for cyclists. It won Best Hack for Social Good and Best Use of DAC Materials at HackDavis 2026.

- Devpost: https://devpost.com/software/aggie-street-smart
- Code: https://github.com/TheLickIn13Keys/hackdavis26

## 1. What the user sees

1. **Enter a start and an end**, and the map shows several routes at once: Safest, Fastest and Alternatives. It recommends the safest one by default, even when that takes a few extra minutes.
2. **Each segment is color-coded by risk**: green is safe, orange means caution, red means avoid.
3. **Each route gets a letter grade** (A/B/C…), so you can compare them at a glance.
4. **A route reasoning panel** explains why a route is safer, e.g. "this stretch has no bike lane" or "this is an uncontrolled four-way intersection".
5. **A Street View preview tour**: an AI agent "rides" the route and plays the street images one by one, with alerts at dangerous spots.
6. **Adjustable safety level**: you choose how much extra distance you'll accept for safety, from a small detour up to the safest route no matter what.
7. **Citywide coverage map**: every scored street in Davis is colored, so it doubles as a safety map of the city.

## 2. How it works (in pipeline order)

1. **Get the road network**: download every bikeable road in Davis from OpenStreetMap, along with its data: lane count, speed limit, bike lane presence and surface.
2. **Sample along each road**: take a point every 80 m and fetch two Street View images, one facing forward and one facing right (shoulder, parking, bike lane). Intersections get four images, one each for north, east, south and west.
3. **AI scores the photos**: the photos and the OSM data go to Gemini together. It returns a 1–10 score and a list of hazards. Hazard types include the door zone next to parked cars, no bike lane, broken pavement, blind corners, right-turn slip lanes and construction. Each hazard is also boxed on the photo.
4. **Compute the route**: the lower a road's score, the longer its "felt distance". Dangerous intersections add an extra penalty distance. A shortest-path algorithm then finds the route with the shortest felt distance, which naturally steers around dangerous segments.
5. **Display**: the frontend uses Next.js + Mapbox. AI analysis streams into the UI gradually, so routes show up without waiting for the AI to finish.

## 3. Techniques worth learning

- **Split the work between AI and data**: whatever OSM already knows (lane count, speed limit) is given to the AI as fact. The AI only judges what the photos alone can show, like pavement condition, how much curbside parking there is, and sight lines. This keeps the scores stable.
- **Give the AI an explicit rubric**: the prompt spells out what each score means, so the scores don't drift:
  - Separated bike path → 9–10
  - Bike lane in good condition → 7–8
  - No bike lane plus curbside parking → 5 at most
  - Multi-lane road with no bike infrastructure → 3–4
  - A road no reasonable person would ride → 1–2
- **Save money**: before buying a Street View image, call the free Metadata API to check that imagery exists there. Fetched images are cached, so nothing is paid for twice.
- **Precompute**: scores for the whole city were computed before the demo and stored in a database. During the demo it only looks up scores and computes routes, so the UI is fast.
- **Fallback for unscored spots**: when an intersection has no AI score, it's estimated from rules. A Y-intersection gets 8, a T 7 and a four-way 5.5, plus 1.5 if it has traffic lights.

## 4. Pitfalls to watch for (if we build something similar)

- Street View images are almost all taken in daytime, so they can't tell you how dark a street is at night.
- The AI scores were never checked against real crash data.
- Their website is offline now, so there's no live demo to look at.

## 5. Where to look in the code

- Scoring prompt: `backend/app/scoring/gemini.py`
- Routing formula: `backend/app/routing/graph.py`
- Street View fetching and cost saving: `backend/app/scoring/streetview.py`
- Road sampling and intersection classification: `backend/app/scoring/network.py`
