"""Schema of the metadata.json emitted alongside every generated .glb.

This mirrors ARCHITECTURE.md section 5. The viewer reads nothing else about
model structure, so this file is the contract between the two services.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Vec3 = tuple[float, float, float]
BBox = tuple[Vec3, Vec3]


class TreeNode(BaseModel):
    """One node of the assembly tree, as read from the STEP product structure."""

    id: str
    name: str
    children: list[TreeNode] = Field(default_factory=list)
    mesh_index: int | None = None


class PartMetadata(BaseModel):
    """Exact properties computed from B-rep topology, not from the mesh."""

    volume_mm3: float
    area_mm2: float
    com: Vec3
    bbox: BBox


class EdgeGeometry(BaseModel):
    """One B-rep edge, described well enough to snap a measurement to it.

    Circles carry their centre, axis and radius so the viewer can report a
    diameter that comes from the CAD definition rather than from three points
    fitted to a tessellated polyline.
    """

    kind: Literal["line", "circle", "other"]
    start: Vec3
    end: Vec3
    length: float
    centre: Vec3 | None = None
    axis: Vec3 | None = None
    radius: float | None = None


class FaceGeometry(BaseModel):
    """One B-rep face. Parallel to the part's entry in `face_groups`."""

    kind: Literal["plane", "cylinder", "cone", "sphere", "other"]
    # Planes carry a normal, cylinders and cones an axis and a radius. Angle
    # measurement between two planar faces needs the exact normals, not ones
    # averaged from triangles.
    normal: Vec3 | None = None
    axis: Vec3 | None = None
    radius: float | None = None


class SnapGeometry(BaseModel):
    """What a part offers a measurement to snap onto.

    Kept per part and exact. For very large assemblies this grows faster than
    the rest of the metadata and will want a binary sidecar, but at MVP sizes
    it is small next to the glb.
    """

    vertices: list[Vec3] = Field(default_factory=list)
    edges: list[EdgeGeometry] = Field(default_factory=list)
    faces: list[FaceGeometry] = Field(default_factory=list)


class ModelMetadata(BaseModel):
    tree: list[TreeNode]
    parts: dict[str, PartMetadata]
    units: str = "mm"
    # Part id -> list of [start, end) triangle ranges, one per B-rep face.
    # The ranges tile the part's triangle list in order. Face level selection
    # and measurement snapping both depend on this.
    face_groups: dict[str, list[tuple[int, int]]] = Field(default_factory=dict)
    # Part id -> exact vertices, edges and face definitions for measurement
    # snapping. See ARCHITECTURE.md section 10: measurements are snapped to
    # this, never to the mesh.
    snap: dict[str, SnapGeometry] = Field(default_factory=dict)


class ConversionResult(BaseModel):
    glb_path: str
    metadata: ModelMetadata
    triangle_count: int
    deflection: float


TreeNode.model_rebuild()
