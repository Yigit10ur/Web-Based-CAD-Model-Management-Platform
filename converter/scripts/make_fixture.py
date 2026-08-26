"""Generate every fixture the converter tests read.

Written rather than checked in by hand so that what each file contains is
stated in code: a test asserting a volume of 4000 mm3 means nothing unless the
box it came from is visibly 40 x 20 x 5 somewhere.

The STEP is produced with the XCAF writer rather than the plain one so it
carries part names, colours and a real assembly structure -- otherwise the
reader path being tested would never see the interesting cases.

    python scripts/make_fixture.py
"""

from __future__ import annotations

from pathlib import Path

from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec
from OCP.Quantity import Quantity_Color, Quantity_TOC_RGB
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.TopLoc import TopLoc_Location
from OCP.XCAFApp import XCAFApp_Application
from OCP.XCAFDoc import XCAFDoc_ColorSurf, XCAFDoc_DocumentTool

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
STEP_FIXTURE = FIXTURES / "assembly.step"
IGES_FIXTURE = FIXTURES / "two_solids.igs"
BOX_FIXTURE = FIXTURES / "box.stl"
OPEN_SURFACE_FIXTURE = FIXTURES / "open_surface.stl"


def _translation(x: float, y: float, z: float) -> TopLoc_Location:
    trsf = gp_Trsf()
    trsf.SetTranslation(gp_Vec(x, y, z))
    return TopLoc_Location(trsf)


def write_step() -> None:
    app = XCAFApp_Application.GetApplication_s()
    doc = TDocStd_Document(TCollection_ExtendedString("XmlOcaf"))
    app.NewDocument(TCollection_ExtendedString("MDTV-XCAF"), doc)

    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    color_tool = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())

    base = BRepPrimAPI_MakeBox(40.0, 20.0, 5.0).Shape()
    post = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(0, 0, 0), gp_Dir(0, 0, 1)), 4.0, 25.0
    ).Shape()
    cap = BRepPrimAPI_MakeBox(12.0, 12.0, 3.0).Shape()

    parts = [
        ("Base Plate", base, (0.55, 0.57, 0.60), _translation(0, 0, 0)),
        ("Support Post", post, (0.80, 0.45, 0.20), _translation(20, 10, 5)),
        ("Top Cap", cap, (0.20, 0.45, 0.80), _translation(14, 4, 30)),
    ]

    assembly = shape_tool.NewShape()
    TDataStd_Name.Set_s(assembly, TCollection_ExtendedString("Bracket Assembly"))

    for name, shape, rgb, location in parts:
        label = shape_tool.AddShape(shape, False)
        TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))
        color_tool.SetColor(
            label, Quantity_Color(*rgb, Quantity_TOC_RGB), XCAFDoc_ColorSurf
        )
        shape_tool.AddComponent(assembly, label, location)

    shape_tool.UpdateAssemblies()

    writer = STEPCAFControl_Writer()
    writer.Transfer(doc)
    STEP_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    writer.Write(str(STEP_FIXTURE))

    _report(STEP_FIXTURE)


def write_iges() -> None:
    """A box and a cylinder in one IGES file.

    Two separate solids on purpose. IGES has no product structure, so the
    reader has no way to keep them apart -- the test that asserts they arrive
    as a single unnamed part is the point of this fixture, not an accident of
    how it was written.
    """
    from OCP.BRep import BRep_Builder
    from OCP.IGESControl import IGESControl_Controller, IGESControl_Writer
    from OCP.TopoDS import TopoDS_Compound

    IGESControl_Controller.Init_s()

    # BRepMode 1 writes solids as manifold_solid_brep. The default writes
    # surfaces instead, and a surface encloses no volume to measure.
    writer = IGESControl_Writer("MM", 1)

    builder = BRep_Builder()
    compound = TopoDS_Compound()
    builder.MakeCompound(compound)
    builder.Add(compound, BRepPrimAPI_MakeBox(40.0, 20.0, 5.0).Shape())
    builder.Add(
        compound,
        BRepPrimAPI_MakeCylinder(
            gp_Ax2(gp_Pnt(20, 10, 5), gp_Dir(0, 0, 1)), 4.0, 25.0
        ).Shape(),
    )

    writer.AddShape(compound)
    writer.ComputeModel()
    writer.Write(str(IGES_FIXTURE))

    _report(IGES_FIXTURE)


def write_meshes() -> None:
    """One watertight mesh and one open surface.

    The open surface exists to pin down the case where a volume cannot be
    measured at all, which is the honest answer rather than a number.
    """
    import numpy as np
    import trimesh

    box = trimesh.creation.box(extents=(40.0, 20.0, 5.0))
    box.apply_translation((20.0, 10.0, 2.5))
    box.export(BOX_FIXTURE)
    _report(BOX_FIXTURE)

    trimesh.Trimesh(
        vertices=np.array(
            [[0, 0, 0], [40, 0, 0], [40, 20, 0], [0, 20, 0]], dtype=float
        ),
        faces=np.array([[0, 1, 2], [0, 2, 3]]),
    ).export(OPEN_SURFACE_FIXTURE)
    _report(OPEN_SURFACE_FIXTURE)


def _report(path: Path) -> None:
    print(f"wrote {path.name} ({path.stat().st_size} bytes)")


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    write_step()
    write_iges()
    write_meshes()


if __name__ == "__main__":
    main()
