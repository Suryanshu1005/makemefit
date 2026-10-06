# MakeMeFit 🏋️‍♂️🥗

MakeMeFit is a modern, full-stack fitness and nutrition tracking application with AI-powered food image analysis, portion estimation, nutrition review & manual correction, real-time daily calorie budgeting, and gamification mechanics.

Built with a scalable TypeScript monorepo architecture powered by **Fastify**, **React 18**, **PostgreSQL (Drizzle ORM)**, and **Google Gemini Vision AI**.

---

## 🏗️ Architecture & Monorepo Structure

The project is structured as an isolated, type-safe monorepo managed with **pnpm workspaces**:

```
makemefit/
├── packages/
│   └── shared/                 # @makemefit/shared: Zod schemas, domain models, calculators, and shared types
├── apps/
│   ├── api/                    # @makemefit/api: Fastify REST backend with PostgreSQL, Drizzle ORM, auth, and AI pipeline
│   └── web/                    # @makemefit/web: React 18 SPA with Tailwind CSS, Lucide icons, and responsive dashboards
├── .github/
│   └── workflows/              # GitHub Actions CI/CD workflows (CI pipeline, GitHub Pages, GHCR Docker deployment)
├── docker-compose.yml          # Local development PostgreSQL container
├── docker-compose.prod.yml     # Production multi-container stack (Postgres + API + Nginx Web)
└── pnpm-workspace.yaml         # Monorepo workspace configuration
```

---

## 🌟 Key Features

1. **AI-Powered Food Logging Pipeline:**
   - **Photo Upload:** Secure multi-part upload validating MIME types, image headers, and file sizes.
   - **Vision Analysis:** Multi-item food identification, portion estimation, macro calculation, and uncertainty flags powered by Gemini Vision.
   - **Nutrition Review & Correction:** Interactive editor to adjust portion sizes, edit quantities, and add/remove custom items without overwriting raw AI estimates.
   - **Authoritative Confirmation:** Atomic PostgreSQL transactions updating meals, meal items, and timezone-aware daily nutrition summaries.
2. **Personalized Calorie Goal Engine:**
   - Accurate BMR & TDEE estimation using the validated **Mifflin-St Jeor** formula.
   - Separate tracking for system-recommended vs user-customized targets.
   - Historical preservation: past days are never mutated when goals change.
3. **Primary V1 Fitness Dashboard:**
   - Live calorie gauge (consumed vs remaining) with target-exceeded states.
   - Macro distribution charts (protein, carbs, fat).
   - Real-time today's logged meals list with instant refresh.
   - Gamification metrics (streak counter, XP, and level).
4. **Timezone Awareness & Audit Integrity:**
   - All daily summaries are computed using the user's geographical timezone (`Asia/Kolkata`, `UTC`, `America/New_York`, etc.).
   - Full audit trail preserved: raw AI vision responses, normalized estimates, user corrections, and confirmed meal records.

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Node.js** >= 20.x
- **pnpm** >= 9.x
- **Docker** & **Docker Compose** (for PostgreSQL)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Suryanshu1005/makemefit.git
cd makemefit
pnpm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Ensure your `.env` contains:
```env
PORT=4000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://makemefit_user:makemefit_password@localhost:5432/makemefit_db
JWT_ACCESS_SECRET=your_super_secret_access_key_min_16_chars
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_16_chars
AI_PROVIDER=mock            # or "gemini"
AI_VISION_PROVIDER=mock     # or "gemini"
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Start Database & Migrate Schema

```bash
# Start local PostgreSQL container
docker-compose up -d

# Push Drizzle schema to database
pnpm --filter @makemefit/api db:push
```

### 4. Run Development Servers

```bash
# Run both API and Web concurrently
pnpm dev

# Or run separately:
pnpm dev:api   # API runs on http://localhost:4000
pnpm dev:web   # Web runs on http://localhost:5173
```

---

## 🧪 Testing & Verification

Run all test suites across the monorepo:

```bash
# Run full monorepo tests
pnpm test

# Run API test suites (with concurrency limit for database pool)
pnpm --filter @makemefit/api test

# Typecheck all packages
pnpm typecheck

# Build all packages
pnpm build
```

---

## 🐳 Production Deployment with Docker

Run the entire production stack locally or on a VPS with a single command:

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

- **Frontend (Web):** Served via Nginx on port `80` with SPA routing and static caching.
- **Backend (API):** Node.js 20 production container on port `4000`.
- **Database:** PostgreSQL 16 on internal network with persistent volume.

---

## 🔄 CI/CD & GitHub Actions

The repository includes pre-configured GitHub Actions workflows:

1. **Continuous Integration (`.github/workflows/ci.yml`):**
   - Automatically runs on pull requests and pushes to `main`.
   - Spawns a PostgreSQL 16 service container.
   - Performs TypeScript typechecking (`pnpm typecheck`).
   - Applies database schema migrations (`pnpm db:push`).
   - Runs unit and integration test suites (`pnpm test`).
   - Builds all workspace artifacts (`pnpm build`).

2. **Continuous Deployment (`.github/workflows/deploy.yml`):**
   - Triggers on push to `main` and manual dispatch.
   - Deploys the React Web SPA to **GitHub Pages**.
   - Builds and publishes production Docker images to **GitHub Container Registry (GHCR)**:
     - `ghcr.io/suryanshu1005/makemefit/api:latest`
     - `ghcr.io/suryanshu1005/makemefit/web:latest`
   - Supports automated webhook deployments (Render, Railway, Coolify, Portainer) via secret `DEPLOY_WEBHOOK_URL`.

---

## 📄 License

MIT © [Suryanshu](https://github.com/Suryanshu1005)
