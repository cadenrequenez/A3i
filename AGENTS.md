# A3i (Artificial Anesthesia Administrative Intelligence)

## Project Structure
- `backend/`
  - `app/`: FastAPI app, SQLAlchemy models, API routes, and scheduling engine.
  - `alembic/`: Database migrations.
  - `requirements.txt`: Backend dependencies.
- `frontend/`
  - `app/`: Next.js App Router pages.
  - `components/`: UI building blocks (calendar, schedule board, drag/drop).
  - `lib/`: API + auth helpers.
- `docs/test-outputs/`: Stored command output for each milestone.

## Setup
1. Create an env file from `.env.example` and update values.
2. Ensure PostgreSQL is running and the database exists.

## Backend Commands
- Install deps: `python3 -m pip install -r backend/requirements.txt`
- Run API: `cd backend && uvicorn app.main:app --reload`
- Run migrations: `cd backend && alembic upgrade head`
- Create migration: `cd backend && alembic revision --autogenerate -m "<message>"`
- Run tests: `python3 -m pytest backend/app/tests`

## Frontend Commands
- Install deps: `cd frontend && npm install`
- Run dev server: `cd frontend && npm run dev`
- Run lint: `cd frontend && npm run lint`

## Scheduling Engine
- Location: `backend/app/scheduling/engine.py`
- Entry point: `generate_monthly_schedule(mds, crnas, start_date)`
  - `mds` / `crnas` are lists of dicts with keys: `id`, `name`, `pedi_qualified`, `cv_qualified`.
  - `start_date` is a `datetime.date` representing the first day of the month.
- Tests: `backend/app/tests/test_scheduling_engine.py`

## Auth Notes
- Backend expects `JWT_SECRET` and `JWT_ALGORITHM`.
- Frontend middleware expects `NEXT_JWT_SECRET` to match `JWT_SECRET`.
- Roles: `admin` (edit), `read-only` (view).
