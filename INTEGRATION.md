# Final main integration

Base: `presentation` / `demo` at `ffc4e6a` (2026-10-17). The final Harbor/Modern and Nature interface, two-decimal percentages, Race, 3D route trees, editable endpoints and presentation assets are retained.

## Branch coverage

| Branch | Integrated result |
| --- | --- |
| presentation / demo | The production website baseline; standalone deck remains in presentation/. |
| refined-map | Already contained by presentation; final routing, team junction overrides and map styling retained. |
| ui/redesign | Already contained by presentation; MapLibre interface and Race retained. |
| fix/routing | Already contained by presentation; felt-distance routing, detour cap and no-worse headline guard retained. |
| bike | Extended area already merged into the single default py/data graph. |
| old main | Its ride-tool features are ported into the final redesigned UI, including backend feature vectors and preference overrides. Legacy duplicate page components are superseded by the one-map interface. |

The earlier `3c02cad` revert removed the integrated tools and deployment configuration. This integration restores those changes and resolves the later presentation edits explicitly. Greenery uses vegetation instead of the blended display score and still displays two decimal places.

Restored tools: route comparisons, named presets, scenic slider, Greenery/Quiet/Shade preferences, segment voting, browser-local hazard reports, spoken route overview and phone safe-area/touch fixes. Hazards do not alter routes; speech is not GPS navigation.

## Production changes

- Render tracks main and runs Node + Python in one supervised Docker service.
- Public proxy serves only map APIs and strips user/session credentials before forwarding to Python.
- Runtime GraphML loading avoids the offline GIS imports. Compatibility tests compare every baked node, edge, geometry and graph attribute against OSMnx.
- Root `check` includes API and web tests. Root lint targets the production workspaces; the historical presentation copy and generated assets are separate.
- CI runs the production checks, Python tests, Docker build and real container route smoke test.

See DEPLOY.md for publication and smoke verification. The public Docker image excludes the Street View cache, environment files and the standalone presentation assets.
