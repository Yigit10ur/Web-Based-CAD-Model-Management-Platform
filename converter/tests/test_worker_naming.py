"""Choosing the name the catalogue shows.

The uploaded file name is the default. It is replaced only when the CAD file
carries the same name in better condition -- which is a narrower thing than
"the file has a name", and the difference is what these tests pin down.
"""

from __future__ import annotations

import pytest

from app.worker import better_name

# The upload that started this: every Turkish character truncated to the low
# byte of its code point (S with cedilla U+015E -> "^", dotted I U+0130 -> "0")
# before the file ever reached us, while the name inside the file was intact.
DAMAGED = "BK-09 BO^LUKSUZ ALUM0NYUM SERVO KAPL0N.STEP"
INTACT = "BK-09 BOŞLUKSUZ SERVO KAPLİN"


def test_repairs_a_damaged_file_name() -> None:
    assert better_name(INTACT, DAMAGED) == INTACT


@pytest.mark.parametrize(
    ("declared", "filename", "why"),
    [
        (
            "Open CASCADE STEP translator 7.9 1",
            "bracket.step",
            "a translator's version string is not a name anyone chose",
        ),
        (
            "Part 1",
            "gearbox housing.step",
            "a placeholder the viewer needs, not a name to publish",
        ),
        (
            "Assembly4",
            "SUSPENSION ARM REV C.stp",
            "the modeller never named it; the uploader did",
        ),
        (None, DAMAGED, "a mesh file declares nothing"),
        (INTACT, None, "nothing to check against on an older version"),
    ],
)
def test_keeps_the_uploaded_name(declared, filename, why) -> None:
    assert better_name(declared, filename) is None, why


def test_ignores_the_extension() -> None:
    # "step" as a word would otherwise match any file with a .step extension.
    assert better_name("STEP translator output", "housing.step") is None


def test_matches_across_case_and_punctuation() -> None:
    assert better_name("Bogie Assembly", "BOGIE-ASSEMBLY_rev2.STEP") == "Bogie Assembly"


def test_a_single_shared_word_is_enough_but_one_letter_is_not() -> None:
    # Short tokens collide by accident; "a" or "1" would match almost anything.
    assert better_name("A Housing", "a bracket.step") is None
    assert better_name("Housing Cover", "housing.step") == "Housing Cover"
