*note [] is for design suggestion

Presentation structure

(xxx)
<Introduction>

(XXX)
This, is a bicycle. it can be used in 2 different way. either a transportation or for leisure activity, like a cycling hobby.
A cyclist that tries to get from one destination to another, they often use google map to lead them. 

(blar) 
Everyday when i go to school, I have to past a Laurance! it is completely unsafe for bikers like me.

(Hz) 
For someone like me who enjoys nature, i prefer to take a small detour to get a better view, but I cant get that with the current google map.

(XXX) 
Our app allow user to switch between Fast route & Natural route. 
Choosing fast route will find the fastest safe path to your destination. User wont have to detour because of a dangerous path.

Choosing Natural mode will trigger the algorithm to move find a path with the most nature.

With RideScape, our app uses complex algorithm to identify the featues of the road for bikers,

(Algorithm analysis on a single location)
1. Pulls Google Street View API imagery sampled every 80m from OpenStreetMap.
2. Analyzes street location:
   - If it's an **intersection**: captures **4 images** (North, East, South, West) to judge crossings and turn lanes.
   - If it's a **road segment**: captures **2 images** — **Forward** (direction of travel) and **Right** (curb side, where bikes ride, parked cars, and bike lanes are).
3. Runs the images through AI model **Claude Haiku 5.5** alongside map facts (speed limit, lane count, existing bike infrastructure).
4. The AI rates road features:
   - **Safety score (1–10)**: Based on civil engineering's **Level of Traffic Stress (LTS 1–4)** — penalizing high speeds, door zones, and unprotected traffic.
   - **Nature score (1–10)**: Measures vegetation density and **tree canopy shade coverage (0–100%)**.

We will repeat this loop over 9000+ streetview images, covering the entire Cupertino streets.
[Using the streetview images i provided, make an animation: the images will swerve in from multiple direction and looping forming a circular shape with hollow center, the hollow center will be a number that constantly grows, up to 13,000 (signifying we used 13k photos to make our algorithm)]

Pathfinding algorithm:
- **Fastest and safe path**: Uses Dijkstra's algorithm on an 8,500-node graph. Instead of just physical distance, it calculates "perceived distance": dangerous roads (like expressways or high-stress multi-lane arterials) receive a penalty that makes them feel **up to 10× longer** to the algorithm. The router naturally routes around hazards onto quiet neighborhood streets while enforcing a strict detour cap so it stays fast.
- **Path with most nature**: Inverts the formula to give a "scenic discount" — segments with high tree canopy shade %, park proximity, and green foliage feel mathematically **shorter** to the algorithm, pulling your route through lush, cooler green corridors with minimal added time.

With this one simple app, can bike safely and happily....
Now its your turn to take your bicycle and choose your way of biking it.
