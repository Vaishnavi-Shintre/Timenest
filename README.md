# Time Nest

Time Nest is a simple productivity web app with tasks, focus tools, and basic stats.

**Stack:** Flask API + MongoDB + JWT auth, with a vanilla HTML/CSS/JS frontend.

## Quick start

1. Create and activate a virtualenv (Windows PowerShell):
   ```powershell
   python -m venv .venv
   . .\.venv\Scripts\Activate.ps1
   ```
2. Install backend deps:
   ```powershell
   pip install -r backend/requirements.txt
   ```
3. Create `backend/.env` with at least:
   ```dotenv
   MONGO_URI=mongodb://localhost:27017/?directConnection=true
   MONGO_DB_NAME=timenest
   JWT_SECRET_KEY=change-me
   SECRET_KEY=change-me-too
   ```
4. Run the app:
   ```powershell
   flask --app backend.app --debug run
   ```
5. Open the UI at `http://127.0.0.1:5000/` and use the **Dashboard**, **Tasks**, **Tools**, and **Profile** pages.

## Main features

- Email/password auth with JWT
- Task management with priorities and due dates
- Focus tools that track streaks and time
- Profile page with stats, work history, reminders, and badges
