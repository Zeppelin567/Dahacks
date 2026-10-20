"""Load baked OSMnx GraphML without importing the offline GIS/scoring stack."""

from __future__ import annotations

import ast
from contextlib import suppress
from pathlib import Path
from xml.etree import ElementTree

import networkx as nx
from shapely import wkt


def _bool(value):
    if isinstance(value, bool):
        return value
    if value in {"True", "False"}:
        return value == "True"
    raise ValueError(f"Invalid GraphML boolean: {value!r}")


def _convert(data: dict, types: dict) -> None:
    for key, value in data.items():
        if isinstance(value, str) and value.startswith(("[", "{")):
            with suppress(ValueError, SyntaxError):
                data[key] = ast.literal_eval(value)
    for key in data.keys() & types.keys():
        value = data[key]
        convert = types[key]
        data[key] = [convert(item) for item in value] if isinstance(value, list) else convert(value)


def load_graphml(path: str | Path) -> nx.MultiDiGraph:
    """Preserve OSMnx's node IDs, parallel edges, tag lists, types and WKT geometry.

    OSMnx remains available to the offline graph-building scripts. The public
    routing service only needs NetworkX, NumPy and Shapely at runtime.
    """
    # Stream records: a full XML tree otherwise dominates cold-start memory.
    graph = nx.MultiDiGraph()
    keys = {}
    ns = "{http://graphml.graphdrawing.org/xmlns}"
    container = None

    def attributes(element):
        return {keys[item.attrib["key"]]: item.text or "" for item in element.findall(f"{ns}data")}

    node_types = dict.fromkeys(("elevation", "elevation_res", "x", "y"), float)
    node_types.update(osmid=int, street_count=int)
    edge_types = dict.fromkeys(("bearing", "grade", "grade_abs", "length", "speed_kph", "travel_time"), float)
    edge_types.update(osmid=int, oneway=_bool, reversed=_bool)
    for event, element in ElementTree.iterparse(path, events=("start", "end")):
        tag = element.tag.removeprefix(ns)
        if event == "start":
            if tag == "graph":
                if element.attrib.get("edgedefault") != "directed":
                    raise ValueError("BikeScape requires a directed routing graph")
                container = element
            continue
        if tag == "key":
            keys[element.attrib["id"]] = element.attrib["attr.name"]
        elif tag in {"node", "edge"}:
            data = attributes(element)
            if tag == "node":
                _convert(data, node_types)
                graph.add_node(int(element.attrib["id"]), **data)
            else:
                _convert(data, edge_types)
                if "geometry" in data:
                    data["geometry"] = wkt.loads(data["geometry"])
                graph.add_edge(
                    int(element.attrib["source"]),
                    int(element.attrib["target"]),
                    key=int(element.attrib.get("id", "0")),
                    **data,
                )
            if container is not None:
                container.remove(element)
            element.clear()
        elif tag == "graph":
            graph.graph.update(attributes(element))
            _convert(graph.graph, {"consolidated": _bool, "simplified": _bool})
    return graph
