from flask import Flask, jsonify
from pymongo import MongoClient
import os


def create_app():
    app = Flask(__name__)

    mongo_uri = os.environ.get("MONGO_URI", "mongodb+srv://Vaishshintre13:AceXJnrUa4tAHJmF@cluster0.ync3uv2.mongodb.net/")
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)

    # Validate the connection up front so the root route reflects real status.
    try:
        client.admin.command("ping")
        app.db = client[os.environ.get("MONGO_DB_NAME", "timenest")]
        _status = {"ok": True, "message": "MongoDB connected"}
    except Exception as exc:  # fallback so the route shows failure details
        _status = {"ok": False, "message": f"MongoDB connection failed: {exc}"}

    @app.route("/")
    def home():
        return jsonify(_status)

    @app.teardown_appcontext
    def close_client(_=None):
        client.close()

    return app


# Expose a module-level `app` for WSGI servers (gunicorn expects `app:app`).
# This calls the factory at import time so `gunicorn app:app` works.
app = create_app()


if __name__ == "__main__":
    # Local development only: run the built-in server.
    # Do not run this in production; Render / Gunicorn will import `app` directly.
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
