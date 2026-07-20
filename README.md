# Tower Tracker — Drone-as-a-Service powerline inspection

A MERN application for tracking powerline tower inspection progress. **One shared
backend** serves **three separate frontends**:

| App         | Who      | Port | How they get in                          |
|-------------|----------|------|------------------------------------------|
| `client-app`| Client   | 5173 | Access **key** (issued by admin)         |
| `pilot-app` | Pilot    | 5174 | Login **ID + password**                  |
| `admin-app` | Admin    | 5175 | Login **ID + password**                  |
| `backend`   | shared API | 5050 | MongoDB (Atlas)                        |

```
Tower Traker/
├── backend/      Express + Mongoose API (auth, client, pilot, admin routes)
├── client-app/   React + Leaflet map + Recharts dashboard
├── pilot-app/    React — Start Day / End Day / Data Update table
└── admin-app/    React — manage clients, pilots, projects, towers
```

## What each role sees

**Client** — enters their access key, picks a project, and views a live dashboard:
- KPIs: Total Towers · Data Capture (done/pending + %) · Data Upload (done/pending + %) · Acquisition Update (start AM / close PM)
- **Map** of the route — each tower coloured **green** (captured + uploaded), **yellow** (captured, upload pending) or **red** (pending)
- **Daily Activity** bar chart (captured vs uploaded per day)
- **Prediction** box — daily averages, tentative completion dates, remaining days
- **Capture vs Upload** cumulative line chart (capture solid, upload dashed)

**Pilot** — logs in and uses three tabs:
- **Start Day** — date, start tower, field image
- **End Day** — date, close tower, field image
- **Data Update** — enter a tower range, get a row per tower with **Data Capture / Data Upload / Issue-Replace** checkboxes; Submit / Reset / Cancel. This is what drives every client KPI and map colour.

**Admin** — logs in and manages everything:
- **Clients** (creates the access key), **Pilots** (creates login credentials), **Projects** (total towers, KML upload, auto-generate towers), and per-project tower/log editing.

## Data flow (single backend)

```
pilot-app  ─┐
client-app ─┼─►  backend /api  ─►  MongoDB (Atlas)
admin-app  ─┘
```
- Pilot ticks "Data Capture/Upload" → updates `Tower` docs.
- Client dashboard + admin views read those same `Tower` docs → KPIs, map colours and charts are always in sync.

## Setup

The backend is already pointed at your MongoDB Atlas cluster in `backend/.env`.

```bash
# 1) Install (already done during setup, repeat if needed)
cd backend     && npm install
cd ../client-app && npm install
cd ../pilot-app  && npm install
cd ../admin-app  && npm install

# 2) Seed demo data (admin, pilot, client key, a 40-tower project)
cd ../backend && npm run seed
```

### Run — one command (from the repo root)
```bash
npm install      # installs "concurrently" once
npm run dev      # starts backend + all 3 frontends together
```

### Run — manually (4 terminals)
```bash
cd backend     && npm run dev     # http://localhost:5050
cd client-app  && npm run dev     # http://localhost:5173
cd pilot-app   && npm run dev     # http://localhost:5174
cd admin-app   && npm run dev     # http://localhost:5175
```

## Local logins (after seeding)

`npm run seed` wipes every collection and creates one admin and one pilot from
your environment. No passwords are hardcoded or printed — this repo is public,
so a password written here is a password published to the world.

Set these in `backend/.env` before seeding:

```
SEED_ADMIN_LOGIN=      SEED_ADMIN_PASSWORD=
SEED_PILOT_LOGIN=      SEED_PILOT_PASSWORD=
```

| Role   | Where                  | Credentials                        |
|--------|------------------------|------------------------------------|
| Admin  | http://localhost:5175  | your `SEED_ADMIN_*` values          |
| Pilot  | http://localhost:5174  | your `SEED_PILOT_*` values          |
| Client | http://localhost:5173  | the access key shown in the admin UI |

## API surface

```
POST /api/auth/login                 admin/pilot login (JWT)
GET  /api/auth/me

POST /api/client/access              { key } -> client + projects
GET  /api/client/dashboard/:id?key=  full dashboard payload

GET  /api/pilot/projects             (pilot JWT)
POST /api/pilot/start-day            (pilot JWT)
POST /api/pilot/end-day              (pilot JWT)
GET  /api/pilot/towers/:id?from=&to= (pilot JWT) range table
POST /api/pilot/data-update          (pilot JWT) save checkbox table

GET/POST/PUT/DELETE /api/admin/clients          (admin JWT)
POST /api/admin/clients/:id/rotate-key
GET/POST/PUT/DELETE /api/admin/pilots           (admin JWT)
GET/POST/PUT/DELETE /api/admin/projects         (admin JWT)
GET  /api/admin/projects/:id/towers
PUT  /api/admin/towers/:projectId/:number
GET  /api/admin/dashboard/:id
GET  /api/admin/projects/:id/logs
```

## Tests

```bash
cd backend && node test/smoke.mjs    # 18 end-to-end checks (uses in-memory Mongo)
```
