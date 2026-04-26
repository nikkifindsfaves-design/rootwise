# Rootwise Technical Specification

## 1) Frontend framework and key libraries

- **Framework:** `Next.js` (`16.2.1`) using the **App Router** (`app/` directory).
- **Language:** `TypeScript` (`strict: true` in `tsconfig.json`).
- **UI runtime:** `React` (`19.2.4`) + `react-dom`.
- **Styling:** `Tailwind CSS` (`tailwindcss` + `@tailwindcss/postcss`).
- **Notable frontend libs:**
  - `react-zoom-pan-pinch` (canvas/pan/zoom interactions in tree UI).
  - `@supabase/ssr` / `@supabase/supabase-js` (auth/data access from client/server).
- **Testing/tooling:** `Vitest`, `@testing-library/react`, `ESLint`, Next ESLint config.

## 2) Backend language and framework

- **Backend runtime:** Next.js server runtime via:
  - **Route Handlers** in `app/api/**/route.ts`
  - **Server actions** (files using `"use server"`).
- **Language:** TypeScript.
- **No separate standalone backend service** (no Express/Nest/Fastify project found).

## 3) Database type and ORM

- **Database:** PostgreSQL via **Supabase**.
- **Schema/migrations:**
  - `supabase/migrations/`
  - `schema.sql`
- **Data access layer:** Supabase query builder (`supabase.from(...).select/insert/update/delete`).
- **ORM:** **None detected** (no Prisma/Drizzle/TypeORM/Mongoose usage).

## 4) Authentication method

- **Auth provider:** Supabase Auth.
- **Login/signup flow:** `app/login/page.tsx` (`signInWithPassword`, `signUp`).
- **Session/user checks:** `supabase.auth.getUser()` used in server routes/components/actions.
- **Route protection:** `proxy.ts` redirects unauthenticated users from protected areas (`/dashboard`, `/review`) to `/login`.

## 5) Folder and file structure (what lives where)

- `app/` — Next.js pages/layouts and API routes.
  - `app/api/` — Route handlers (document processing, story regeneration, review save, merges, delete tree, places).
  - `app/dashboard/` — main authenticated workspace and tree UI (including `[treeId]` canvas/person routes).
  - `app/review/` — review workflows for records/duplicates.
  - `app/person/` — person detail views.
  - `app/login/` — authentication UI.
- `lib/` — shared domain logic and utilities.
  - `lib/supabase/` — browser/server Supabase client factories.
  - `lib/events/`, `lib/review/`, `lib/person-merge/`, `lib/utils/` — business logic and helpers.
  - `lib/themes/`, `lib/theme/`, `lib/vibes/` — theming/tone systems.
- `components/` — reusable UI components.
- `public/` — static assets.
- `supabase/` — Supabase project artifacts and SQL migrations.
- `__tests__/` — Vitest test files.
- Root configs: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `postcss.config.mjs`, `proxy.ts`, `schema.sql`.

## 6) Third-party APIs/services in use

- **Supabase** (primary external platform):
  - Auth
  - Postgres DB
  - Storage (documents/photos)
- **Anthropic API** via `@anthropic-ai/sdk`:
  - Used in `app/api/process-document/route.ts`
  - Used in `app/api/regenerate-story/route.ts`
- No explicit Stripe/Sentry/GA/AWS service integration detected in scanned code.

## 7) Environment variable names (names only)

Detected in code:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BILLING_ENABLED`
- `BILLING_PILOT_MODE`
- `BILLING_REQUIRE_AUTH_FOR_PILOT`
- `BILLING_HARD_STOP_ON_ZERO`
- `STRIPE_PRICE_BASIC_MONTHLY`
- `STRIPE_PRICE_BASIC_ANNUAL`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_MAX_MONTHLY`
- `STRIPE_PRICE_MAX_ANNUAL`
- `STRIPE_PRICE_POSSESSED_MONTHLY`
- `STRIPE_PRICE_POSSESSED_ANNUAL`
- `STRIPE_ADDON_CREDITS_250`
- `STRIPE_ADDON_CREDITS_450`
- `STRIPE_ADDON_CREDITS_800`
- `RESEND_API_KEY`
- `SUPPORT_FROM_EMAIL`

## 8) Current deployment setup

- Standard Next.js scripts in `package.json`:
  - `dev`, `build`, `start`
- No explicit deployment infra config found (no `vercel.json`, Dockerfile, or CI workflow files detected in this scan).
- README is mostly default Next.js template text (mentions Vercel generically, but not a customized deployment pipeline).

## 9) Consistent patterns and conventions

- **App Router conventions:** route segments and dynamic params like `[treeId]`, `[personId]`, `[recordId]`.
- **API convention:** each endpoint in `app/api/**/route.ts` with `GET`/`POST`/`DELETE` exports.
- **Server/client boundary:** explicit `"use client"` and `"use server"` usage.
- **Path aliasing:** consistent `@/*` imports (configured in `tsconfig.json`).
- **Naming style:** mostly kebab-case filenames and domain-grouped folders.
- **Multi-tenant safety pattern:** frequent auth checks + `user_id` filtering before data operations.
