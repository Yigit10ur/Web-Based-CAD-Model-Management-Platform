"""The mesh import path.

STL, OBJ, PLY and glTF carry triangles and nothing else. These tests pin down
what that costs: the numbers are measured rather than exact, there is nothing
to snap a measurement to, and a mesh that encloses no volume says so instead of
reporting one.

Unlike the B-rep tests these need no OCCT, so they run everywhere.
"""

from __future__ import annotations

import json
import struct
from pathlib import Path

import pytest

from app.pipeline import convert

FIXTURES = Path(__file__).parent / "fixtures"

# A 40 x 20 x 5 box, written as triangles. The dimensions are known, so the
# expected values can be written down rather than recorded from a run.
BOX = FIXTURES / "box.stl"
OPEN_SURFACE = FIXTURES / "open_surface.stl"


@pytest.fixture(scope="module")
def box(tmp_path_factory):
    out = tmp_path_factory.mktemp("mesh") / "box.glb"
    result = convert(BOX, out)
    return result, out


@pytest.fixture(scope="module")
def open_surface(tmp_path_factory):
    out = tmp_path_factory.mktemp("mesh") / "open.glb"
    result = convert(OPEN_SURFACE, out)
    return result, out


def _gltf_json(glb: bytes) -> dict:
    json_length = struct.unpack("<I", glb[12:16])[0]
    return json.loads(glb[20 : 20 + json_length])


def test_the_source_is_labelled_as_a_mesh(box):
    result, _ = box
    # The viewer reads this to decide whether to present the numbers as exact.
    assert result.metadata.geometry_source == "mesh"


def test_a_watertight_mesh_reports_its_volume(box):
    result, _ = box
    part = next(iter(result.metadata.parts.values()))

    assert part.volume_mm3 == pytest.approx(40 * 20 * 5)
    assert part.area_mm2 == pytest.approx(2 * (40 * 20 + 40 * 5 + 20 * 5))


def test_a_mesh_that_encloses_nothing_reports_no_volume(open_surface):
    result, _ = open_surface
    part = next(iter(result.metadata.parts.values()))

    # An open surface has an area and no interior. Reporting a number here
    # would be a confident wrong answer.
    assert part.volume_mm3 is None
    assert part.area_mm2 == pytest.approx(40 * 20)


def test_no_face_groups_or_snap_targets_are_invented(box):
    result, _ = box

    # A triangle corner is a tessellation artefact, not a design intent. The
    # viewer falls back to the raw point under the cursor when these are empty,
    # which is the honest behaviour for a mesh.
    assert result.metadata.face_groups == {}
    assert result.metadata.snap == {}


def test_bounding_box_matches_the_source(box):
    result, _ = box
    part = next(iter(result.metadata.parts.values()))
    low, high = part.bbox

    assert low == pytest.approx((0.0, 0.0, 0.0))
    assert high == pytest.approx((40.0, 20.0, 5.0))


def test_sharp_creases_are_exported_as_lines(box):
    _, out = box
    gltf = _gltf_json(out.read_bytes())

    modes = {
        primitive.get("mode", 4)
        for mesh in gltf["meshes"]
        for primitive in mesh["primitives"]
    }
    # A box has twelve sharp edges; drawn without them it reads as a blob.
    assert modes == {1, 4}


def test_a_flat_surface_has_no_creases_to_draw(open_surface):
    _, out = open_surface
    gltf = _gltf_json(out.read_bytes())

    modes = {
        primitive.get("mode", 4)
        for mesh in gltf["meshes"]
        for primitive in mesh["primitives"]
    }
    assert modes == {4}


def test_metadata_is_written_next_to_the_glb(box):
    _, out = box
    metadata = json.loads(out.with_suffix(".json").read_text())

    assert metadata["geometry_source"] == "mesh"
    assert metadata["units"] == "mm"
    assert len(metadata["tree"]) == 1


def test_a_mesh_declares_no_name(tmp_path: Path) -> None:
    """An STL has no product structure, so it has no name of its own to give.

    Without this the catalogue would fill up with models called `Solid`, or
    with the file name arriving back by a longer route.
    """
    result = convert(BOX, tmp_path / "box.glb")

    assert result.metadata.geometry_source == "mesh"
    assert result.metadata.declared_name is None
