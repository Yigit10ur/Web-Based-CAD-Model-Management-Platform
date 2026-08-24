"""End to end conversion tests.

Skipped when OCCT is not installed, which is the case in CI: the geometry path
is covered here and by the Docker build, not by every pull request.
"""

from __future__ import annotations

import json
import struct
from math import pi
from pathlib import Path

import pytest

from app.cad import occt

pytestmark = pytest.mark.skipif(
    not occt.available(), reason="OCCT bindings not installed"
)

FIXTURE = Path(__file__).parent / "fixtures" / "assembly.step"

# The fixture is three primitives with known dimensions, so the exact values
# the B-rep should report can be written down rather than recorded from a run.
EXPECTED = {
    "Base Plate": {"volume": 40 * 20 * 5, "faces": 6},
    "Support Post": {"volume": pi * 4**2 * 25, "faces": 3},
    "Top Cap": {"volume": 12 * 12 * 3, "faces": 6},
}


@pytest.fixture(scope="module")
def converted(tmp_path_factory) -> tuple[dict, bytes]:
    out = tmp_path_factory.mktemp("out") / "assembly.glb"
    result = occt.convert(FIXTURE, out)
    metadata = json.loads(out.with_suffix(".json").read_text())
    assert result.triangle_count > 0
    return metadata, out.read_bytes()


def _names(metadata: dict) -> dict[str, str]:
    found: dict[str, str] = {}

    def walk(node: dict) -> None:
        found[node["id"]] = node["name"]
        for child in node["children"]:
            walk(child)

    for root in metadata["tree"]:
        walk(root)
    return found


def _gltf_json(glb: bytes) -> dict:
    json_length = struct.unpack("<I", glb[12:16])[0]
    return json.loads(glb[20 : 20 + json_length])


def test_assembly_tree_keeps_names_and_structure(converted):
    metadata, _ = converted
    assert len(metadata["tree"]) == 1
    root = metadata["tree"][0]
    assert root["name"] == "Bracket Assembly"
    assert [child["name"] for child in root["children"]] == list(EXPECTED)


def test_volumes_are_exact_not_estimated_from_the_mesh(converted):
    metadata, _ = converted
    names = _names(metadata)

    for part_id, part in metadata["parts"].items():
        expected = EXPECTED[names[part_id]]["volume"]
        # A mesh derived volume would be off by whole percent at this
        # tessellation; the B-rep value is exact.
        assert part["volume_mm3"] == pytest.approx(expected, rel=1e-9)


def test_component_placement_is_applied(converted):
    metadata, _ = converted
    names = _names(metadata)
    by_name = {names[pid]: part for pid, part in metadata["parts"].items()}

    # The post sits on top of the 5 mm base plate and is 25 mm tall.
    low, high = by_name["Support Post"]["bbox"]
    assert low[2] == pytest.approx(5.0)
    assert high[2] == pytest.approx(30.0)


def test_face_groups_cover_every_brep_face(converted):
    metadata, _ = converted
    names = _names(metadata)

    for part_id, ranges in metadata["face_groups"].items():
        assert len(ranges) == EXPECTED[names[part_id]]["faces"]
        # Ranges must tile the triangle list without gaps or overlaps,
        # otherwise face level picking would land on the wrong face.
        assert ranges[0][0] == 0
        for (_, end), (start, _) in zip(ranges, ranges[1:], strict=False):
            assert end == start


def test_edges_are_exported_as_line_primitives(converted):
    _, glb = converted
    gltf = _gltf_json(glb)

    names = [node.get("name") for node in gltf["nodes"]]
    assert sum(name.endswith("__edges") for name in names) == len(EXPECTED)

    modes = {
        primitive.get("mode", 4)
        for mesh in gltf["meshes"]
        for primitive in mesh["primitives"]
    }
    assert modes == {1, 4}  # LINES and TRIANGLES


def test_part_colours_survive_the_round_trip(converted):
    _, glb = converted
    gltf = _gltf_json(glb)
    materials = {
        material.get("name"): material["pbrMetallicRoughness"]["baseColorFactor"]
        for material in gltf.get("materials", [])
    }

    assert materials["Support Post"][:3] == pytest.approx([0.80, 0.45, 0.20], abs=0.01)
