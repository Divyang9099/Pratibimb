# Pratibimb (प्रतिबिम्ब:) — Drone Inspection Tracking Platform

> A full-stack, real-time SaaS platform that lets drone-inspection companies manage
> powerline / transmission-tower surveys end to end — from field data capture by
> pilots, to live progress dashboards for their clients.

---

## Tagline options (pick one for your site)

- **Short:** Full-stack real-time platform for managing drone-based powerline inspections, with separate apps for admins, field pilots, and clients.
- **One-liner:** A MERN + Socket.io SaaS that tracks thousands of transmission towers across drone-inspection projects, with live maps, analytics, and role-based portals.
- **Resume bullet:** Designed and shipped a production multi-tenant inspection platform (3 React apps + Node/Express API + MongoDB) with real-time updates, geospatial mapping, and a fully automated cloud deployment pipeline.

---

## What the project is

**Pratibimb** is a "Drone-as-a-Service" management platform for companies that inspect
electrical transmission lines using drones. A single inspection project can contain
hundreds or thousands of towers (one real project in the system has **885 towers**),
and the work happens over weeks in the field. The platform replaces phone calls and
spreadsheets with a single source of truth that updates in real time.

It is built as **three distinct single-page applications backed by one shared API**,
each tailored to a different user role:

| App | Users | Purpose |
|-----|-------|---------|
| **Admin app** | Operations team | Create clients & projects, upload route maps, manage pilots/accounts, edit tower data |
| **Pilot app** | Drone pilots in the field | Log start/end of day, mark towers captured/uploaded, report issues, upload field photos |
| **Client app** | Customers | Read-only live dashboard of their project's progress, accessed via a private key |

---

## Key features

### Tower progress tracking (the core)
- Every tower has a status that drives the whole system, modelled as a small state machine:
  - 🔴 **Red** — pending capture
  - 🟡 **Yellow** — captured, upload pending
  - 🟢 **Green** — captured & uploaded (done)
- Bulk "Data Update" editor lets a pilot or admin update a numbered range of towers at once.
- Each capture/upload is attributed to the pilot who did it, with timestamps.

### Geospatial route mapping
- Admins upload a **KML file**; the backend parses it (`@tmcw/togeojson`) into a route
  polyline and per-tower GPS coordinates.
- The client dashboard renders the full powerline route on an interactive **Leaflet map**,
  with each tower drawn as a colour-coded dot matching its status.

### Live client dashboard & analytics
- Real-time KPIs: total towers, % captured, % uploaded, days remaining.
- **Recharts** visualisations: daily activity (captured vs uploaded per day) and a
  cumulative progress chart, both plotted by date.
- **Completion forecasting**: the backend projects estimated finish dates from the
  running daily averages.
- Auto-refreshes every 30 seconds and pushes live updates over **WebSockets**.

### Field workflow for pilots
- Start-of-day / end-of-day logging with optional **photo upload** (stored on Cloudinary),
  configurable per project.
- "Non-working day" logging (rain, access denied, etc.) so gaps in the timeline are explained.
- Tower issue reporting (e.g. "tower needs replacement", "landowner denied access").

### Role-based access & account management
- **JWT + bcrypt** authentication for admins and pilots.
- A separate **access-key** scheme for clients — they get a private key instead of a
  username/password, so dashboards can be shared safely and keys rotated.
- Full account-management UI: admins can create/edit any account, change login IDs and
  passwords, and view stored credentials, with guardrails (can't delete yourself, can't
  remove the last admin, etc.).

---

## Tech stack

**Frontend (×3 apps)**
- React 18 + Vite
- React-Leaflet + Leaflet (interactive maps)
- Recharts (data visualisation)
- Axios (HTTP), Socket.io-client (real-time)

**Backend**
- Node.js + Express (ES modules)
- MongoDB Atlas + Mongoose
- Socket.io (WebSocket real-time layer)
- JWT (`jsonwebtoken`) + bcrypt for auth
- Cloudinary SDK (image hosting)
- `@tmcw/togeojson` (KML → GeoJSON parsing)

**Infrastructure & DevOps**
- AWS EC2 (Ubuntu) running the API under **PM2**
- **Nginx** reverse proxy with WebSocket upgrade support
- **Let's Encrypt / Certbot** for HTTPS
- Frontends hosted on cPanel; custom **PowerShell + FTP deploy scripts** for one-command releases
- `.htaccess` for SPA routing, HTTP→HTTPS redirects, and Content-Security-Policy hardening

---

## Architecture

```
                 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
                 │  Admin app   │   │  Pilot app   │   │  Client app  │
                 │  (React/Vite)│   │  (React/Vite)│   │  (React/Vite)│
                 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
                        │   HTTPS (REST) + WSS (Socket.io)    │
                        └──────────────────┼──────────────────┘
                                           ▼
                                ┌─────────────────────┐
                                │   Nginx (HTTPS,      │
                                │   WebSocket proxy)   │
                                └──────────┬───────────┘
                                           ▼
                                ┌─────────────────────┐
                                │  Express API (PM2)   │   AWS EC2
                                │  JWT · Socket.io     │
                                └──────────┬───────────┘
                          ┌────────────────┼─────────────────┐
                          ▼                                   ▼
                  ┌───────────────┐                  ┌────────────────┐
                  │ MongoDB Atlas │                  │   Cloudinary   │
                  │ (Mongoose)    │                  │ (field photos) │
                  └───────────────┘                  └────────────────┘
```

**Data model (5 collections):** `User` (admins + pilots), `Client`, `Project`,
`Tower`, `DailyLog`. The `Tower` document is the source of truth for both the map
colours and the client KPIs.

---

## Engineering highlights (great talking points for interviews)

- **Multi-app / single-API design** — three independently deployable React apps sharing
  one role-aware Express backend, keeping each UI minimal and each user's data isolated.
- **Real-time architecture** — Socket.io over an Nginx reverse proxy required configuring
  WebSocket `Upgrade` headers and proxying `wss://` traffic alongside HTTPS REST.
- **Geospatial pipeline** — parsing raw KML survey files into a route polyline + tower
  coordinates, then rendering and colour-coding them live on a Leaflet map.
- **Derived analytics** — turning raw per-tower timestamps into daily activity charts,
  cumulative progress, and data-driven completion-date forecasts.
- **Production deployment from scratch** — provisioned an EC2 instance, set up PM2,
  Nginx, and Let's Encrypt HTTPS, configured DNS, and solved real cross-environment bugs
  (cache-busting, browser-specific TLS/caching behaviour, CSP conflicts on shared hosting).
- **Deployment automation** — wrote PowerShell scripts that build and FTP-deploy each
  frontend in one command, making releases repeatable.

---

## Suggested portfolio blurb (ready to paste)

> **Pratibimb — Drone Inspection Tracking Platform**
> A production full-stack SaaS platform for managing drone-based powerline inspections.
> Built as three role-specific React apps (admin, field pilot, and client) on a shared
> Node.js/Express + MongoDB API, with real-time updates via Socket.io, interactive
> geospatial maps (Leaflet + KML parsing), live analytics and completion forecasting
> (Recharts), and Cloudinary-hosted field photos. Deployed to AWS EC2 behind Nginx with
> Let's Encrypt HTTPS and PM2, plus custom automated deployment scripts.
>
> **Stack:** React · Vite · Node.js · Express · MongoDB · Socket.io · Leaflet · Recharts · AWS EC2 · Nginx · Cloudinary
