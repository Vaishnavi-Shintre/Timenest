import os
import secrets
from datetime import datetime
from urllib.parse import urlencode

import requests
from flask import Flask, jsonify, redirect, request, session
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv


def create_app():
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=False)

    # Point Flask to frontend folder for static files and templates
    frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
    app = Flask(__name__, 
                static_folder=frontend_dir,
                static_url_path="",
                template_folder=frontend_dir)
    app.config.from_object("backend.config.Config")

    # Core extensions
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)
    JWTManager(app)

    # Ensure sessions are secure by default (can be overridden via env/config)
    app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)
    # For local development over HTTP we keep SECURE = False; enable it in production.
    app.config.setdefault("SESSION_COOKIE_SECURE", False)

    # Initialize DB teardown hooks
    from backend.utils.db import init_app as init_db, get_db

    init_db(app)

    # Register blueprints
    from backend.routes.auth_routes import auth_bp
    from backend.routes.task_routes import tasks_bp
    from backend.routes.habit_routes import habits_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(tasks_bp, url_prefix="/api/tasks")
    app.register_blueprint(habits_bp, url_prefix="/api/habits")

    # --- Google OAuth 2.0 (Authorization Code flow, using Flask sessions) ---
    google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    google_client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    google_redirect_uri = os.environ.get(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:5000/auth/google/callback",
    )

    google_auth_endpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    google_token_endpoint = "https://oauth2.googleapis.com/token"
    google_userinfo_endpoint = "https://www.googleapis.com/oauth2/v3/userinfo"

    if not google_client_id or not google_client_secret:
        app.logger.warning(
            "Google OAuth is not fully configured; GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing."
        )

    @app.route("/auth/google")
    def google_login():
        """Initiate Google OAuth 2.0 Authorization Code flow.

        Redirects the user to Google's OAuth consent screen.
        """
        if not google_client_id or not google_client_secret:
            return jsonify({"error": "Google OAuth not configured"}), 500

        state = secrets.token_urlsafe(32)
        session["oauth_state"] = state

        params = {
            "client_id": google_client_id,
            "redirect_uri": google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "include_granted_scopes": "true",
            "state": state,
            "prompt": "consent",
        }

        auth_url = f"{google_auth_endpoint}?{urlencode(params)}"
        return redirect(auth_url)

    @app.route("/auth/google/callback")
    def google_callback():
        """Handle Google's OAuth 2.0 callback.

        Exchanges the authorization code for tokens, fetches the user's
        profile, persists the user in MongoDB, stores session data, and then
        redirects to the dashboard.
        """
        if not google_client_id or not google_client_secret:
            return jsonify({"error": "Google OAuth not configured"}), 500

        error = request.args.get("error")
        if error:
            return jsonify({"error": f"Google OAuth error: {error}"}), 400

        state = request.args.get("state")
        if not state or state != session.get("oauth_state"):
            return jsonify({"error": "Invalid OAuth state"}), 400

        code = request.args.get("code")
        if not code:
            return jsonify({"error": "Missing authorization code"}), 400

        # Exchange code for tokens
        token_data = {
            "code": code,
            "client_id": google_client_id,
            "client_secret": google_client_secret,
            "redirect_uri": google_redirect_uri,
            "grant_type": "authorization_code",
        }

        try:
            token_resp = requests.post(google_token_endpoint, data=token_data, timeout=10)
            token_resp.raise_for_status()
            token_json = token_resp.json()
        except Exception as exc:  # noqa: BLE001
            app.logger.exception("Error exchanging code for tokens with Google: %s", exc)
            return jsonify({"error": "Failed to exchange authorization code"}), 502

        access_token = token_json.get("access_token")
        if not access_token:
            return jsonify({"error": "Missing access token from Google"}), 502

        # Fetch user info from Google
        try:
            userinfo_resp = requests.get(
                google_userinfo_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            userinfo_resp.raise_for_status()
            userinfo = userinfo_resp.json()
        except Exception as exc:  # noqa: BLE001
            app.logger.exception("Error fetching userinfo from Google: %s", exc)
            return jsonify({"error": "Failed to fetch user info from Google"}), 502

        email = userinfo.get("email")
        name = userinfo.get("name") or userinfo.get("given_name") or "Google User"

        if not email:
            return jsonify({"error": "Google account does not have an email address"}), 400

        db = get_db()
        users_collection = db["users"]

        user = users_collection.find_one({"email": email})
        if user is None:
            user_doc = {
                "email": email,
                "name": name,
                "auth_provider": "google",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            result = users_collection.insert_one(user_doc)
            user = users_collection.find_one({"_id": result.inserted_id})
        else:
            # Update basic profile fields on each login without touching other logic
            users_collection.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "name": name,
                        "auth_provider": user.get("auth_provider", "google"),
                        "updated_at": datetime.utcnow(),
                    }
                },
            )

        # Persist user in Flask session (no JWT here)
        session.pop("oauth_state", None)
        session["user_id"] = str(user["_id"])
        session["user_email"] = user.get("email")
        session["user_name"] = user.get("name")
        session["auth_provider"] = user.get("auth_provider", "google")

        # Mark session as permanent so standard PERMANENT_SESSION_LIFETIME applies
        session.permanent = True

        # Redirect to dashboard in the frontend
        return redirect("/dashboard.html")

    # Serve frontend pages
    @app.get("/")
    def index():
        from flask import send_from_directory
        return send_from_directory(app.static_folder, "index.html")
    
    @app.get("/<path:path>")
    def serve_static(path):
        from flask import send_from_directory
        # Serve files from frontend folder
        if os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        # If not found, try adding .html extension
        if os.path.exists(os.path.join(app.static_folder, f"{path}.html")):
            return send_from_directory(app.static_folder, f"{path}.html")
        return jsonify(error="Not Found"), 404

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service="Time Nest API"), 200

    @app.errorhandler(404)
    def not_found(_):
        return jsonify(error="Not Found"), 404

    @app.errorhandler(500)
    def server_error(_):
        return jsonify(error="Internal Server Error"), 500

    return app


# Instantiate app for 'flask --app backend.app run'
app = create_app()


if __name__ == "__main__":
    # Direct run support: python -m backend.app
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
