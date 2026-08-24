"""Format dispatch for the conversion pipeline."""

from __future__ import annotations

from pathlib import Path

from app.config import settings
from app.models import ConversionResult

BREP_FORMATS = {".step", ".stp", ".iges", ".igs"}
MESH_FORMATS = {".stl", ".obj", ".ply"}
SUPPORTED_FORMATS = BREP_FORMATS | MESH_FORMATS | {".glb", ".gltf"}


class UnsupportedFormatError(ValueError):
    """Raised for a file extension the MVP does not handle.

    Native CAD formats (.sldprt, .catpart, .prt, .ipt) land here on purpose:
    they need a commercial SDK and are out of scope. See ARCHITECTURE.md
    section 9.
    """


def choose_deflection(bbox_diagonal_mm: float) -> float:
    """Scale tessellation deflection with model size, within configured bounds.

    A fixed value is the single most common way to end up with an unusable
    output file, so deflection is always derived from the bounding box.
    """
    proposed = bbox_diagonal_mm / 1000.0
    return min(max(proposed, settings.min_deflection), settings.max_deflection)


def convert(source: Path, out_glb: Path) -> ConversionResult:
    suffix = source.suffix.lower()

    if suffix not in SUPPORTED_FORMATS:
        raise UnsupportedFormatError(f"unsupported format: {suffix}")

    if suffix in BREP_FORMATS:
        from app.cad import occt

        if not occt.available():
            raise RuntimeError(
                "OCCT bindings are not installed; "
                'run: pip install -e ".[cad]" or use the Docker image'
            )
        # Deflection is left to the reader: it needs the bounding box, which
        # is not known until the file has been read.
        return occt.convert(source, out_glb)

    raise NotImplementedError(f"mesh path not implemented yet: {suffix}")
