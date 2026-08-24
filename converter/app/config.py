from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from the environment."""

    model_config = SettingsConfigDict(env_prefix="CONVERTER_", env_file=".env")

    database_url: str = "postgresql://localhost/cad_dev"

    s3_endpoint: str = ""
    s3_bucket: str = "cad-models"
    s3_access_key: str = ""
    s3_secret_key: str = ""

    # Tessellation quality. Deflection is scaled by the model bounding box at
    # runtime; these are the bounds it is clamped to. A fixed fine value turns
    # a 50 MB STEP file into a 300 MB glb -- see ARCHITECTURE.md section 5.
    min_deflection: float = 0.01
    max_deflection: float = 1.0
    max_triangles: int = 2_000_000

    max_upload_mb: int = 200

    # Seconds between database polls for queued jobs.
    poll_interval: float = 5.0


settings = Settings()
