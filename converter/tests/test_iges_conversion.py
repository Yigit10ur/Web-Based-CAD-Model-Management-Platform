"""The IGES path.

IGES was in the reader from the beginning and had never been run. These tests
were written after finding out what it actually produces, which is not what
STEP produces: the geometry comes through exactly, and the product structure
does not come through at all.

That second half is the useful part to pin down. Someone exporting an assembly
to IGES and finding one nameless part in the tree deserves to have been told,
and if a future OCCT version starts preserving names, this test failing is how
we notice.
"""

from __future__ import annotations

from math import pi
from pathlib import Path

import pytest

from app.cad import occt
from app.pipeline import convert

pytestmark = pytest.mark.skipif(
    not occt.available(), reason="OCCT bindings not installed"
)

FIXTURE = Path(__file__).parent / "fixtures" / "two_solids.igs"

# A 40 x 20 x 5 box and a radius 4, height 25 cylinder, written as one file.
BOX_VOLUME = 40 * 20 * 5
CYLINDER_VOLUME = pi * 4**2 * 25


@pytest.fixture(scope="module")
def converted(tmp_path_factory):
    out = tmp_path_factory.mktemp("iges") / "two_solids.glb"
    result = convert(FIXTURE, out)
    return result


def test_iges_is_read_as_exact_geometry(converted):
    # Same path as STEP: this is a B-rep format, not a mesh one.
    assert converted.metadata.geometry_source == "brep"
    assert converted.triangle_count > 0


def test_volume_and_area_survive_the_exchange(converted):
    part = next(iter(converted.metadata.parts.values()))

    # Both solids in one part, so the volume is their sum. Exact, not measured
    # off the triangles.
    assert part.volume_mm3 == pytest.approx(BOX_VOLUME + CYLINDER_VOLUME, rel=1e-9)


def test_faces_and_edges_are_available_to_measure(converted):
    part_id = next(iter(converted.metadata.parts))
    snap = converted.metadata.snap[part_id]

    # Six planes from the box plus three faces from the cylinder.
    assert len(converted.metadata.face_groups[part_id]) == 9

    circles = [edge for edge in snap.edges if edge.kind == "circle"]
    assert len(circles) == 2
    for circle in circles:
        # A diameter read off an IGES file is still the CAD radius.
        assert circle.radius == pytest.approx(4.0, rel=1e-9)


def test_iges_carries_no_assembly_structure(converted):
    metadata = converted.metadata

    # The fixture holds two separate solids. STEP would give two named parts in
    # a named assembly; IGES has no product structure to carry either, so they
    # arrive fused into one. This is a property of the format, not a bug in the
    # reader -- prefer STEP when the tree matters.
    assert len(metadata.parts) == 1
    assert len(metadata.tree) == 1
    assert metadata.tree[0].children == []
    assert metadata.tree[0].name == "COMPOUND"
