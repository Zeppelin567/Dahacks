# RideScape presentation

Open **http://localhost:5173/presentation** while the existing development server is running.
For a production build:

```powershell
npm run build
npm run preview -w web -- --host 127.0.0.1 --port 4173
```

Then open **http://127.0.0.1:4173/presentation**. The presentation is a separate, lazy-loaded
route; the bike map remains at `/`.

## Presenting

- Arrow keys, Page Up / Page Down, or Space: change slides.
- Bottom navigation or a deliberate wheel gesture: change slides.
- **F**: fullscreen. **O**: slide overview. **N**: speaker notes. **P**: pause motion.
- Drag the bicycle or street graph to rotate it.
- Scroll from the Fast & Safe product slide to the Nature product slide. The journey
  stays selected. Switch modes directly with the tabs if needed. Select a journey, adjust scenic preference,
  and click the route photos or streets to reveal the existing app's street cards.
- Use **Watch the recording** for the supplied MVP video, or **Live app** to open the map.

Slides never advance automatically. Scrolling over the product map changes slides,
while wheel zoom is disabled there; map clicks still inspect streets. Inputs, video, and dialogs
retain their own controls. Reduced-motion preferences are respected. Notes are hidden
by default; they are an on-screen reference, not a separate presenter window.

## Local media

The supplied media and captured API data are already prepared on this computer under
`web/public/presentation-media/`. That directory and the Street View cache are ignored
by Git. A Vite build copies the prepared presentation assets into `web/dist`.
Keep the media folder with the project when moving the deck to another computer.

To rebuild assets from the original files:

```powershell
python scripts/prepare-presentation.py --streetview-zip "PATH/streetview.zip" --nature-photo "PATH/nature.jpeg" --lawrence-photo "PATH/lawrence.png" --nature-video "PATH/nature.mp4" --demo-video "PATH/demo.mp4"
```

This also restores the supplied Street View JPEGs into `py/data/cache/streetview`, so
the live app can display them. With the existing Python service running on port 8000:

```powershell
python scripts/capture-presentation.py
```

The capture script stores real route responses, street details, photos, and map geometry
for three Cupertino journeys. Mode changes and route-photo interactions use those local
snapshots, so they don't depend on an API response during the talk. Arbitrary street
clicks fall back to the running API; basemap tiles still require internet access.

Optional video poster frames (requires FFmpeg):

```powershell
ffmpeg -y -ss 1 -i web/public/presentation-media/nature.mp4 -frames:v 1 web/public/presentation-media/crossing-poster.jpg
ffmpeg -y -ss 4 -i web/public/presentation-media/demo.mp4 -frames:v 1 web/public/presentation-media/demo-poster.jpg
```

## Content decisions

The animated counter ends at **13,000**, the full dataset total confirmed by the team.
The supplied ZIP contains 8,931 images. Graph statistics and example scores come from
the project's data, while the cost slider is labelled as an illustration.

The supplied WhatsApp video contains nature footage. The crossing scene is an original
3D illustration, labelled accordingly. It is not a reconstruction of a recorded crash.
Speech is kept in optional notes; the ten scenes contain visual prompts for the talk.
