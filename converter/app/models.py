"""Schema of the metadata.json emitted alongside every generated .glb.

This mirrors ARCHITECTURE.md section 5. The viewer reads nothing else about
model structure, so this file is the contract between the two services.
"""

from __future__ import annotations

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


class ModelMetadata(BaseModel):
    tree: list[TreeNode]
    parts: dict[str, PartMetadata]
    units: str = "mm"
    # Part id -> list of [start, end) triangle ranges, one per B-rep face.
    # The ranges tile the part's triangle list in order. Face level selection
    # and measurement snapping both depend on this.
    face_groups: dict[str, list[tuple[int, int]]] = Field(default_factory=dict)


class ConversionResult(BaseModel):
    glb_path: str
    metadata: ModelMetadata
    triangle_count: int
    deflection: float


TreeNode.model_rebuild()
