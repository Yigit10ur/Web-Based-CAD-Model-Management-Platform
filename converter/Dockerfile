# The image exists for OCCT. Nothing else here is hard to install, and nothing
# else is why the converter is a separate service.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# OCP ships self-contained wheels, but the graphics stack underneath still
# wants a few system libraries present.
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

# Nothing here needs root, and a conversion is the code most likely to be fed
# something hostile: it parses untrusted files for a living.
RUN useradd --create-home --uid 10001 converter && chown -R converter /srv
USER converter

# The worker is the point of this image. The health API is still in here and
# can be run instead with:
#   docker run <image> uvicorn app.main:app --host 0.0.0.0 --port 8000
CMD ["python", "-m", "app.worker"]
