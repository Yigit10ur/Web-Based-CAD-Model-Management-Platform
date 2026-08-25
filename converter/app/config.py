from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from the environment.

    The variable names match the web application's on purpose: both services
    talk to the same database and the same bucket, so one .env file configures
    the pair and there is no second set of names to keep in step.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""

    storage_endpoint: str = ""
    storage_region: str = "auto"
    storage_bucket: str = "cad-models"
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""

    # Tessellation quality. Deflection is scaled by the model bounding box at
    # runtime; these are the bounds it is clamped to. A fixed fine value turns
    # a 50 MB STEP file into a 300 MB glb -- see ARCHITECTURE.md section 5.
    min_deflection: float = 0.01
    max_deflection: float = 1.0
    max_triangles: int = 2_000_000

    max_upload_mb: int = 200

    # Seconds between database polls for queued jobs.
    poll_interval: float = 5.0

    # A job still marked `processing` after this long is treated as abandoned
    # by a crashed worker and put back on the queue.
    stale_job_seconds: int = 1800


settings = Settings()
