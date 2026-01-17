import os
from datetime import timedelta

# Load .env from project root so local development MONGO_URI is picked up
try:
    from dotenv import load_dotenv
    load_dotenv()  # loads .env into environment
except Exception:
    # python-dotenv may not be installed in some environments; fallback to env vars
    pass


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-this-jwt-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.environ.get("JWT_EXPIRES_HOURS", "12")))

    MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/?directConnection=true")
    MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "timenest")

    ENV = os.environ.get("FLASK_ENV", "development")
    DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"
    JSON_SORT_KEYS = False
