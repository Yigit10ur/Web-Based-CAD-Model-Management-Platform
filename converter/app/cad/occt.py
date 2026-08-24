"""OCCT backed conversion. This is where the week-1 spike lands.

Everything that imports OpenCascade lives behind this module so the rest of the
service -- and CI -- can run without it installed. Import it lazily.

Reference for the intended implementation (ARCHITECTURE.md section 5):

    STEPControl_Reader / IGESControl_Reader   read the file
    XCAFDoc_ShapeTool                         walk the assembly tree
    BRepMesh_IncrementalMesh                  tessellate at a chosen deflection
    BRepGProp                                 exact volume, area, centre of mass
    Bnd_Box                                   bounding box
    TopExp_Explorer over TopAbs_EDGE          edge polylines for the CAD look
"""

from __future__ import annotations

from pathlib import Path

from app.models import ConversionResult


def available() -> bool:
    """Whether the OCCT bindings can be imported in this environment."""
    try:
        import OCP  # noqa: F401
    except ImportError:
        return False
    return True


def convert(source: Path, out_glb: Path, deflection: float) -> ConversionResult:
    """Read a B-rep file, tessellate it and write a .glb plus its metadata."""
    raise NotImplementedError(
        "OCCT pipeline not implemented yet -- see spike/occt-step-to-glb"
    )
