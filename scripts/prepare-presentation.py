"""Prepare local presentation assets without committing Street View imagery.

Uses only the standard library. Pass the original media paths on the command line.
"""

import argparse
import json
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'py' / 'data'
OUT = ROOT / 'web' / 'public' / 'presentation-media'
CACHE = DATA / 'cache' / 'streetview'


def rows(name):
    return [json.loads(x) for x in (DATA / name).read_text(encoding='utf-8').splitlines() if x]


def prepare(args):
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.streetview_zip) as archive:
        images = [x for x in archive.infolist() if x.filename.lower().endswith('.jpg')]
        for entry in images:
            # Only the filename is used, never an archive-provided output path.
            dest = CACHE / Path(entry.filename).name
            if not dest.exists():
                with archive.open(entry) as src, dest.open('wb') as out:
                    shutil.copyfileobj(src, out)
    for source, name in [(args.nature_photo, 'nature.jpeg'), (args.lawrence_photo, 'lawrence.png'),
                         (args.nature_video, 'nature.mp4'), (args.demo_video, 'demo.mp4')]:
        shutil.copyfile(source, OUT / name)

    samples = rows('samples.jsonl')
    safe = {x['sample_id']: x['result'] for x in rows('safety_scores.jsonl')
            if x['status'] == 'ok' and x['prompt_version'] == 'safe-v2'}
    green = {x['sample_id']: x['result'] for x in rows('green_scores.jsonl') if x['status'] == 'ok'}
    usable = [s for s in samples if s['kind'] == 'road' and s.get('photos')
              and s['sample_id'] in green and s['sample_id'] in safe and s.get('name')
              and all((CACHE / p).is_file() for p in s['photos'])]
    selected, seen = [], set()
    # Mix leafy streets, arterials and quieter roads for a representative photo orbit.
    ordered = sorted(usable, key=lambda s: green[s['sample_id']]['greenery_score'], reverse=True)
    for pool in (ordered, list(reversed(ordered)), usable):
        added = 0
        for s in pool:
            if s['name'] not in seen:
                selected.append(s)
                seen.add(s['name'])
                added += 1
            if added == 20:
                break
    photos = []
    for i, s in enumerate(selected):
        g, a = green[s['sample_id']], safe[s['sample_id']]
        src = f'street-{i:02d}.jpg'
        shutil.copyfile(CACHE / s['photos'][0], OUT / src)
        right = None
        if len(s['photos']) > 1:
            right = f'street-{i:02d}-right.jpg'
            shutil.copyfile(CACHE / s['photos'][1], OUT / right)
        photos.append(dict(src=src, right=right, name=s['name'], at=s['lat_lng'],
                           safety=a['safety_score'], greenery=g['greenery_score'],
                           shade=g['shade_sky_pct'], safeNote=a['note'], greenNote=g['note'],
                           hazards=a['hazards'], lts=a['lts'], date=s.get('pano_date')))
    junction = next(s for s in samples if s['kind'] == 'junction' and len(s.get('photos', [])) == 4
                    and all((CACHE / p).is_file() for p in s['photos']))
    junctions = []
    for i, p in enumerate(junction['photos']):
        name = f'junction-{i}.jpg'
        shutil.copyfile(CACHE / p, OUT / name)
        junctions.append(name)
    ns = {'g': 'http://graphml.graphdrawing.org/xmlns'}
    graph = ET.parse(DATA / 'cupertino_bike.graphml')
    manifest = dict(photoCount=len(images), nodeCount=len(graph.findall('.//g:node', ns)),
                    edgeCount=len(graph.findall('.//g:edge', ns)), safetySamples=len(safe),
                    greenSamples=len(green), sampleCount=len(samples), photos=photos,
                    junctionPhotos=junctions)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in manifest.items() if k not in ('photos', 'junctionPhotos')}))
    print(f'Prepared {len(photos)} presentation photo sets and {len(images)} cached app photos.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for key in ('streetview-zip', 'nature-photo', 'lawrence-photo', 'nature-video', 'demo-video'):
        parser.add_argument('--' + key, required=True)
    prepare(parser.parse_args())
