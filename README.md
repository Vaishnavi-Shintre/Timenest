# Time Nest

A minimal full‑stack productivity web application scaffold with Flask (backend), MongoDB (PyMongo), JWT auth, and a vanilla HTML/CSS/JS frontend.

## Tech Stack

- Backend: Flask, Flask‑CORS, flask‑jwt‑extended
- Database: MongoDB via PyMongo
- Auth: JWT
- Config: python‑dotenv
- Frontend: HTML, CSS, Vanilla JavaScript

## Project Structure

```
backend/
  app.py
  config.py
  .env
  requirements.txt
  routes/
    __init__.py
    auth_routes.py
    task_routes.py
    habit_routes.py
  models/
    user_model.py
    task_model.py
    habit_model.py
  utils/
    db.py
    auth_utils.py

frontend/
  index.html
  login.html
  dashboard.html
  tasks.html
  habits.html
  css/
    style.css
  js/
    auth.js
    tasks.js
    habits.js
```

## Backend Setup

1) Create and activate a virtual environment (Windows PowerShell):

```powershell
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
```

2) Install requirements:

```powershell
pip install -r backend/requirements.txt
```

3) Configure environment variables in `backend/.env` (already templated):

Required basics:

- `MONGO_URI` e.g. `mongodb://localhost:27017/?directConnection=true`
- `MONGO_DB_NAME` e.g. `timenest`
- `JWT_SECRET_KEY` set to a long random string
- `SECRET_KEY` a long random string used for Flask sessions

### Google OAuth 2.0 (optional, for "Sign in with Google")

To enable Google login on the `/login.html` page:

1. Create an **OAuth 2.0 Client ID** in Google Cloud Console (type: *Web application*).
2. Add this as an **Authorized redirect URI** in the client:

  - `http://127.0.0.1:5000/auth/google/callback`

3. Add the following to `backend/.env` **without quotes and without spaces around `=`**:

```dotenv
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:5000/auth/google/callback
```

> Do **not** commit real client IDs or secrets to Git. Use local `.env` only and rotate the secret if it is ever exposed.

4) Run the API:

```powershell
flask --app backend.app --debug run
```

The API exposes a health check at `GET /api/health` and modular blueprints under `/api/auth`, `/api/tasks`, `/api/habits`. Endpoints currently return JSON stubs (no business logic yet).

## Frontend

Static HTML pages live under `frontend/`. During backend development, you can open these files directly in a browser or serve them via a simple static server extension. The JS stubs call the API routes and display status codes/messages.

## Next Steps

- Expand validation and error responses (schemas, constraints).
- Add habit streak logic server-side with a dedicated complete endpoint.
- Add pagination and filtering for tasks/habits.
- Persist tokens with refresh tokens if needed.

## API Overview (current)

- Auth
  - POST `/api/auth/register` { email, password } → `{ user, access_token }`
  - POST `/api/auth/login` { email, password } → `{ user, access_token }`
  - GET `/api/auth/me` (Bearer token) → `{ user }`
- Tasks (Bearer token)
  - GET `/api/tasks/` → `{ items: Task[] }`
  - POST `/api/tasks/` { title, description?, priority?, due_date? (ISO) } → `{ item }`
  - PUT `/api/tasks/:id` { title?, description?, priority?, due_date?(ISO), completed? } → `{ item }`
  - DELETE `/api/tasks/:id` → `{ status: "deleted", id }`
- Habits (Bearer token)
  - GET `/api/habits/` → `{ items: Habit[] }`
  - POST `/api/habits/` { name, frequency } → `{ item }`
  - PUT `/api/habits/:id` { name?, frequency?, streak?, last_completed_at?(ISO) } → `{ item }`
  - DELETE `/api/habits/:id` → `{ status: "deleted", id }`
