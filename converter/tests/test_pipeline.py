from pathlib import Path

import pytest

from app.config import settings
from app.pipeline import UnsupportedFormatError, choose_deflection, convert


def test_native_cad_format_is_rejected():
    with pytest.raises(UnsupportedFormatError):
        convert(Path("part.sldprt"), Path("out.glb"))


def test_deflection_scales_with_model_size():
    small = choose_deflection(50.0)
    large = choose_deflection(5000.0)
    assert small < large


def test_deflection_stays_within_configured_bounds():
    assert choose_deflection(0.001) == settings.min_deflection
    assert choose_deflection(1_000_000.0) == settings.max_deflection
