"""Generate the STEP fixture used by the converter tests.

Written with the XCAF writer rather than the plain STEP writer so the file
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

FIXTURE = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "assembly.step"


def _translation(x: float, y: float, z: float) -> TopLoc_Location:
    trsf = gp_Trsf()
    trsf.SetTranslation(gp_Vec(x, y, z))
    return TopLoc_Location(trsf)


def main() -> None:
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
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    writer.Write(str(FIXTURE))

    print(f"wrote {FIXTURE} ({FIXTURE.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
