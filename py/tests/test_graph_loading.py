"""Cold-start requests must share a single graph allocation."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event

from app.bikemap import engine


def test_concurrent_requests_load_graph_once(monkeypatch, tmp_path):
    graph_file = tmp_path / "graph.graphml"
    graph_file.touch()
    graph = object()
    started = Event()
    duplicate = Event()
    release = Event()
    calls = []

    def load(_path):
        calls.append(_path)
        if len(calls) > 1:
            duplicate.set()
        started.set()
        assert release.wait(5), "test failed to release graph loader"
        return graph

    monkeypatch.setattr(engine, "_G", None)
    monkeypatch.setattr(engine, "_graph_path", lambda: graph_file)
    monkeypatch.setattr(engine.ox, "load_graphml", load)
    with ThreadPoolExecutor(max_workers=4) as pool:
        first = pool.submit(engine._load_graph)
        assert started.wait(5)
        others = [pool.submit(engine._load_graph) for _ in range(3)]
        try:
            assert not duplicate.wait(0.15), "concurrent requests allocated duplicate graphs"
        finally:
            release.set()
        assert all(f.result(timeout=5) is graph for f in [first, *others])
    assert len(calls) == 1


def test_failed_load_can_retry(monkeypatch, tmp_path):
    graph_file = tmp_path / "graph.graphml"
    graph_file.touch()
    graph = object()
    calls = []

    def load(_path):
        calls.append(_path)
        if len(calls) == 1:
            raise ValueError("temporary load failure")
        return graph

    monkeypatch.setattr(engine, "_G", None)
    monkeypatch.setattr(engine, "_graph_path", lambda: graph_file)
    monkeypatch.setattr(engine.ox, "load_graphml", load)
    try:
        engine._load_graph()
    except ValueError:
        pass
    else:
        raise AssertionError("initial load should fail")
    assert engine._load_graph() is graph
    assert len(calls) == 2
