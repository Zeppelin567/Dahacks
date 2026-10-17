"""Save real local API results for a dependable, interactive presentation demo."""
import json
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'web/public/presentation-media'
BASE = 'http://localhost:8000/bikemap'


def api(path, data=None):
    request = urllib.request.Request(BASE + path, data=json.dumps(data).encode() if data else None,
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def local_photo(detail):
    photo = detail.get('photo')
    if photo:
        name = photo['url'].rsplit('/', 1)[-1]
        source = ROOT / 'py/data/cache/streetview' / name
        if source.exists():
            shutil.copyfile(source, OUT / name)
            photo['url'] = '/presentation-media/' + name
    return detail


places = api('/places')
byid = {p['id']: p for p in places}
trips = []
for start, end in [('deanza', 'main-street'), ('library', 'blackberry-farm'), ('deanza', 'mcclellan-ranch')]:
    a, b = byid[start], byid[end]
    trip = dict(id=end, start=a, end=b, routes={}, photos={}, details=[])
    for mode, rural in [('safe', .5), ('green', 0), ('green', .5), ('green', 1)]:
        key = 'safe' if mode == 'safe' else f'green{rural:g}'
        route = api('/route', dict(start=[a['lat'], a['lng']], end=[b['lat'], b['lng']],
                                  mode=mode, rural=rural, prefs=dict(green=True, quiet=True, shade=False)))
        trip['routes'][key] = route
        coords = route['recommended']['coords']
        photos = api('/route-photos', dict(coords=coords, mode=mode, count=5))
        for photo in photos:
            local_photo(photo['detail'])
        trip['photos'][key] = photos
        for at in coords[::max(1, len(coords)//7)]:
            try:
                detail = local_photo(api(f'/street?lat={at[0]}&lng={at[1]}&mode={mode}'))
                trip['details'].append(dict(at=at, detail=detail))
            except Exception:
                pass
    trips.append(trip)
    print('Captured:', a['name'], 'to', b['name'], flush=True)
network = api('/network?layer=safe')
layers = api('/green-layers')
(OUT / 'routes.json').write_text(json.dumps(dict(places=places, trips=trips, network=network, layers=layers)), encoding='utf-8')
print('Saved routes.json')
