# OCCT is the reason this service is containerised: installing it reliably on a
# developer machine is the riskiest single step in the plan (ARCHITECTURE.md
# section 10). Getting this image to build is the week-1 goal.

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# OCP wheels are self contained, but trimesh and the graphics stack still want
# a few system libraries present.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglu1-mesa \
        libxrender1 \
        libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY pyproject.toml ./
COPY app ./app

RUN pip install --upgrade pip && pip install ".[cad]"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
