# Single-page integration

The features from main commit `07cd8e7` are integrated into the `ui-single-page` UI.

- `app.tsx`: route comparison, nature presets, persisted segment votes, voice overview and hazard toggle.
- `map-view.tsx`: segment voting popups, previous route overlay, hazard markers and resize handling.
- `models.py` / `engine.py`: clamped preference overrides and length-weighted segment features.
- The obsolete two-page route components remain removed; `/safe` and `/green` redirect to the single-page map.
- Hazard reports and segment preferences are saved in this browser, not shared with other riders.
- Voice instructions describe route segments; they do not track progress with GPS.

Run `npm run dev:py` and `npm run dev` for development.
