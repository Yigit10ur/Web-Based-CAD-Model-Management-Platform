"""Build a STEP assembly with a given number of parts, for measuring scale.

Triangle count and part count are different axes and they load different parts
of the system. The models to hand were 11 and 18 parts, so nothing here had ever
been asked to draw a tree with hundreds of rows, issue hundreds of draw calls,
or carry snap data for hundreds of solids. This makes a file that asks.

    python scripts/make_large_assembly.py 500 /tmp/large.step
    python scripts/make_large_assembly.py 500 /tmp/large.step --distinct

Two shapes of assembly, because they load different things. Without
`--distinct` the parts are instances of a handful of definitions, which is what
a machine full of the same bolt looks like -- and the viewer collapses those
into one row each. With it, every part is its own definition with its own name,
which is what an assembly of genuinely different parts looks like, and the tree
has a row for each.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path


def make_primitive(kind: int, scale: float):
    """One of the five shapes, at a size no other part shares."""
    from OCP.BRepPrimAPI import (
        BRepPrimAPI_MakeBox,
        BRepPrimAPI_MakeCylinder,
        BRepPrimAPI_MakeTorus,
    )

    if kind == 0:
        return BRepPrimAPI_MakeBox(12.0 * scale, 8.0, 4.0).Shape()
    if kind == 1:
        return BRepPrimAPI_MakeCylinder(2.0, 20.0 * scale).Shape()
    if kind == 2:
        return BRepPrimAPI_MakeCylinder(5.0 * scale, 3.0).Shape()
    if kind == 3:
        return BRepPrimAPI_MakeTorus(6.0 * scale, 1.5).Shape()
    return BRepPrimAPI_MakeBox(6.0 * scale, 6.0, 6.0).Shape()


def build(count: int, out: Path, distinct: bool = False) -> None:
    from OCP.BRepPrimAPI import (
        BRepPrimAPI_MakeBox,
        BRepPrimAPI_MakeCylinder,
        BRepPrimAPI_MakeTorus,
    )
    from OCP.gp import gp_Trsf, gp_Vec
    from OCP.STEPCAFControl import STEPCAFControl_Writer
    from OCP.STEPControl import STEPControl_AsIs
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDocStd import TDocStd_Document
    from OCP.TopLoc import TopLoc_Location
    from OCP.XCAFApp import XCAFApp_Application
    from OCP.XCAFDoc import XCAFDoc_DocumentTool

    app = XCAFApp_Application.GetApplication_s()
    doc = TDocStd_Document(TCollection_ExtendedString("XmlOcaf"))
    app.NewDocument(TCollection_ExtendedString("MDTV-XCAF"), doc)
    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())

    # A handful of prototypes rather than one, so the file looks like an
    # assembly of different things rather than one part repeated.
    prototypes = [
        ("Bracket", BRepPrimAPI_MakeBox(12.0, 8.0, 4.0).Shape()),
        ("Pin", BRepPrimAPI_MakeCylinder(2.0, 20.0).Shape()),
        ("Spacer", BRepPrimAPI_MakeCylinder(5.0, 3.0).Shape()),
        ("Washer", BRepPrimAPI_MakeTorus(6.0, 1.5).Shape()),
        ("Block", BRepPrimAPI_MakeBox(6.0, 6.0, 6.0).Shape()),
    ]

    if distinct:
        # A definition per part, each with a name of its own. The name a
        # component carries is ignored by the reader in favour of the name on
        # the definition it points at, so this is the only way to get a part
        # that is not one of five things repeated.
        #
        # The geometry has to differ too. `AddShape` returns the existing label
        # for a shape it already holds, so handing it the same solid five
        # hundred times gives one label whose name is overwritten five hundred
        # times -- which is what the first attempt at this did, and it produced
        # five rows named after whichever part happened to be last.
        labels = []
        for index in range(count):
            base = prototypes[index % len(prototypes)][0]
            scale = 1.0 + index / 1000.0
            shape = make_primitive(index % len(prototypes), scale)

            label = shape_tool.AddShape(shape, False)
            TDataStd_Name.Set_s(
                label, TCollection_ExtendedString(f"{base} {index + 1:03d}")
            )
            labels.append(label)
    else:
        labels = []
        for name, shape in prototypes:
            label = shape_tool.AddShape(shape, False)
            TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))
            labels.append(label)

    assembly = shape_tool.NewShape()
    TDataStd_Name.Set_s(assembly, TCollection_ExtendedString(f"{count} Part Assembly"))

    # Laid out on a grid so the parts do not sit inside one another, which would
    # make the result useless to look at and unfair to measure.
    side = math.ceil(math.sqrt(count))
    for index in range(count):
        name, _ = prototypes[index % len(prototypes)]
        transform = gp_Trsf()
        transform.SetTranslation(
            gp_Vec(float(index % side) * 30.0, float(index // side) * 30.0, 0.0)
        )

        component = shape_tool.AddComponent(
            assembly,
            labels[index] if distinct else labels[index % len(labels)],
            TopLoc_Location(transform),
        )
        TDataStd_Name.Set_s(
            component, TCollection_ExtendedString(f"{name} {index + 1:03d}")
        )

    shape_tool.UpdateAssemblies()

    out.parent.mkdir(parents=True, exist_ok=True)
    writer = STEPCAFControl_Writer()
    writer.Transfer(doc, STEPControl_AsIs)
    writer.Write(str(out))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    distinct = "--distinct" in sys.argv

    count = int(args[0]) if args else 500
    out = Path(args[1]) if len(args) > 1 else Path("large.step")

    build(count, out, distinct)
    kind = "distinct" if distinct else "repeated"
    print(f"{count} {kind} parts -> {out} ({out.stat().st_size / 1024 / 1024:.2f} MB)")
