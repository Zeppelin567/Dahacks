"""The public loader must preserve every attribute of the baked routing graph."""

from pathlib import Path

import osmnx as ox

from app.bikemap.graph import load_graphml


def test_baked_graph_matches_offline_osmnx_loader():
    path = Path(__file__).resolve().parents[1] / "data/cupertino_bike.graphml"
    actual = load_graphml(path)
    expected = ox.load_graphml(path)
    assert actual.is_directed() and actual.is_multigraph()
    assert actual.graph == expected.graph
    assert dict(actual.nodes(data=True)) == dict(expected.nodes(data=True))
    assert dict(((u, v, k), data) for u, v, k, data in actual.edges(keys=True, data=True)) == dict(
        ((u, v, k), data) for u, v, k, data in expected.edges(keys=True, data=True)
    )
