"""Mesh import: STL, OBJ, PLY and glTF.

These formats carry triangles and nothing else. There is no B-rep behind them,
so everything the B-rep path reports exactly is either measured here or
omitted:

    volume, area        measured from the triangles, and volume only when the
                        mesh is watertight -- an open surface encloses nothing
    face groups         absent; a mesh has no faces to group triangles into
    snap targets        absent; a triangle corner is a tessellation artefact,
                        not a design intent

The output shape is the same as the B-rep path's, so the viewer needs no
special case beyond reading `geometry_source`.

Units are assumed to be millimetres. None of these formats records units, and
a file authored in inches will report numbers that are wrong by 25.4 with no
way for us to know.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np

from app.models import ConversionResult, ModelMetadata, PartMetadata, TreeNode, Vec3

# Two faces meeting at a sharper angle than this are treated as an edge worth
# drawing. Low enough to catch a chamfer, high enough that the facets of a
# tessellated cylinder do not all become lines.
SHARP_EDGE_DEGREES = 30.0

DEFAULT_COLOR = (0.62, 0.64, 0.67)


def _bounds(mesh) -> tuple[Vec3, Vec3]:
    low, high = mesh.bounds
    return (float(low[0]), float(low[1]), float(low[2])), (
        float(high[0]),
        float(high[1]),
        float(high[2]),
    )


def measure(mesh) -> PartMetadata:
    """Mass properties measured from the triangles.

    `is_watertight` is the question that decides whether a volume exists at
    all: a scan or an open surface has a surface area but encloses nothing, and
    trimesh will still hand back a number for it.
    """
    centre = mesh.center_mass if mesh.is_watertight else mesh.centroid
    low, high = _bounds(mesh)

    return PartMetadata(
        volume_mm3=float(mesh.volume) if mesh.is_watertight else None,
        area_mm2=float(mesh.area),
        com=(float(centre[0]), float(centre[1]), float(centre[2])),
        bbox=(low, high),
    )


def sharp_edges(mesh) -> np.ndarray:
    """Vertex pairs where two triangles meet at a sharp angle.

    A mesh drawn without them reads as a smooth blob; these give it the
    creases that make a shape legible, standing in for the B-rep edges the
    other path exports.
    """
    threshold = math.radians(SHARP_EDGE_DEGREES)
    angles = mesh.face_adjacency_angles
    steep = mesh.face_adjacency_edges[angles > threshold]

    if len(steep) == 0:
        return np.zeros((0, 2, 3), dtype=np.float64)

    return mesh.vertices[steep]


def convert(source: Path, out_glb: Path) -> ConversionResult:
    """Read a mesh file and write the same two outputs the B-rep path writes."""
    import trimesh
    from trimesh.path.entities import Line
    from trimesh.visual import TextureVisuals
    from trimesh.visual.material import PBRMaterial

    loaded = trimesh.load(source, force="scene")
    scene = trimesh.Scene()

    surfaces = [
        (name, geometry)
        for name, geometry in loaded.geometry.items()
        if isinstance(geometry, trimesh.Trimesh)
    ]

    # A single-geometry file has no name of its own to give: trimesh falls back
    # to the file name, which by the time the worker has downloaded it is
    # "source.stl". An OBJ with several groups does carry real names, so those
    # are kept.
    def label(name: object) -> str:
        return str(name) if len(surfaces) > 1 else "Solid"

    parts: dict[str, PartMetadata] = {}
    nodes: list[TreeNode] = []
    triangle_total = 0

    for index, (name, geometry) in enumerate(surfaces):
        part_id = f"n{index + 1}"
        mesh = geometry.copy()

        colour = DEFAULT_COLOR
        mesh.visual = TextureVisuals(
            material=PBRMaterial(
                name=label(name),
                baseColorFactor=[*(int(c * 255) for c in colour), 255],
                metallicFactor=0.1,
                roughnessFactor=0.6,
            )
        )
        scene.add_geometry(mesh, geom_name=part_id, node_name=part_id)

        segments = sharp_edges(geometry)
        if len(segments) > 0:
            vertices = segments.reshape(-1, 3)
            scene.add_geometry(
                trimesh.path.Path3D(
                    entities=[
                        Line(np.array([i * 2, i * 2 + 1])) for i in range(len(segments))
                    ],
                    vertices=vertices,
                ),
                geom_name=f"{part_id}__edges",
                node_name=f"{part_id}__edges",
            )

        parts[part_id] = measure(geometry)
        nodes.append(TreeNode(id=part_id, name=label(name), mesh_index=index))
        triangle_total += len(geometry.faces)

    if not parts:
        raise ValueError(f"no surfaces found in {source.name}")

    metadata = ModelMetadata(
        geometry_source="mesh",
        # A mesh file has no product structure, so the tree is flat. A single
        # root keeps the viewer's tree panel looking the same either way.
        tree=[TreeNode(id="n0", name=source.stem, children=nodes)]
        if len(nodes) > 1
        else nodes,
        parts=parts,
        units="mm",
    )

    out_glb.parent.mkdir(parents=True, exist_ok=True)
    out_glb.write_bytes(scene.export(file_type="glb"))
    out_glb.with_suffix(".json").write_text(metadata.model_dump_json(indent=2))

    return ConversionResult(
        glb_path=str(out_glb),
        metadata=metadata,
        triangle_count=triangle_total,
        # Nothing was tessellated; the triangles arrived as they are.
        deflection=0.0,
    )
