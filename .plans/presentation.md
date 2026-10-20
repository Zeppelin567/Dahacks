# RideScape interactive presentation

An in-app presentation at `/presentation`, separate from the public bike map.

## Story and interaction

Ten full-screen scenes: introduction, two reasons to ride, Lawrence crossing, nature,
Fast & Safe product, Nature product, photo analysis, citywide image orbit, route weighting, closing.
Use arrows, Space, navigation buttons or a deliberate wheel gesture to advance.
Provide fullscreen, overview, a pause control and optional speaker notes. No automatic
slide advancement. Ignore deck navigation while an interactive map or input has focus.

## Visual direction

Dark charcoal, warm white and pale mint. Large editorial type, generous space,
real photography, a drag-rotatable Three.js bicycle and an illustrative crossing scene.
Use the existing BikeMap map, street card, theme and photo-strip components in the demo.
Keep speech in notes. Use few words on stage. Reduced motion gets static 3D scenes
and short opacity fades. Pause off-screen animation and video.

## Data and media

The supplied archive has 8,931 images. The user confirmed the complete dataset includes
another batch and totals 13,000, which is the final number of the animated photo counter.
The current committed graph has 8,514 nodes and 19,817 directed edges. Do not claim a
verified 95% coverage figure. Call the commute option Fast & Safe, without promising
that the mathematically shortest path is always safe. Green routing favors greener
edges by assigning them lower relative cost; current code penalizes less green edges.

The WhatsApp video is nature footage. Build the requested Lawrence crossing visual as
an illustrative simulation, labelled as such, rather than claiming it is a real crash.

Media lives in gitignored `web/public/presentation-media/`. Extract Street View photos
to the existing gitignored Python cache too. Save actual API routes and street details
for reliable demonstrations, with an option to open the live app and the supplied recording.
No paid image or model calls are needed during the presentation.
