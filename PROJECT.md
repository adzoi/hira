# Gigori — Project Documentation

**Gigori** (გიგორი) is a Georgian-language freelance marketplace that connects **freelancers** (specialists offering services) with **hirers** (clients posting jobs or buying services). The product is built as a single-page React application backed by **Supabase** (Postgres, Auth, Storage, Realtime, Edge Functions) and deployed as a static frontend with a small Node static server.

This document explains what the system does, how it works, and why key design choices were made.

---

## Table of contents

1. [What problem Gigori solves](#what-problem-gigori-solves)
2. [High-level architecture](#high-level-architecture)
3. [Tech stack](#tech-stack)
4. [User types and roles](#user-types-and-roles)
5. [Application routes](#application-routes)
6. [Core user journeys](#core-user-journeys)
7. [Marketplace model: two sides of the platform](#marketplace-model-two-sides-of-the-platform)
8. [Database design](#database-design)
9. [Row Level Security (RLS)](#row-level-security-rls)
10. [Supabase Edge Functions](#supabase-edge-functions)
11. [Realtime and notifications](#realtime-and-notifications)
12. [VIP / featured placement (PayPal)](#vip--featured-placement-paypal)
13. [Messaging (chat)](#messaging-chat)
14. [CV generator and public CV pages](#cv-generator-and-public-cv-pages)
15. [Security model](#security-model)
16. [Frontend architecture](#frontend-architecture)
17. [Deployment and operations](#deployment-and-operations)
18. [Local development](#local-development)
19. [Testing and load testing](#testing-and-load-testing)
20. [Project directory layout](#project-directory-layout)
21. [Design principles and rationale](#design-principles-and-rationale)

---

## What problem Gigori solves

Freelance work in Georgia lacks a dedicated, localized platform where:

- Freelancers can publish **service listings** (what they offer, at what price) and build a public profile with portfolio, skills, and reviews.
- Hirers can post **job vacancies** with budgets, skills, and contact preferences, then manage applicants.
- Both sides can discover each other through search, categories, a home feed, and saved/bookmarked items.
- Trust is built through **reviews**, **completed work history**, profile visits, and optional VIP promotion.

Gigori addresses this with a bilingual-ready data model (Georgian UI, `name_ka` / `name_en` in categories), Georgian copy throughout the UI, and flows tuned for the local market (cities, GEL pricing display, PayPal USD capture where GEL checkout is unavailable).

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React SPA)                       │
│  Vite + React 19 + React Router + Tailwind CSS + PayPal SDK     │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ Supabase JS (anon key)          │ PayPal checkout
                ▼                               ▼
┌───────────────────────────┐         ┌──────────────────────────┐
│      Supabase Backend      │         │   PayPal REST API        │
│  • Postgres + RLS          │         │   (sandbox / live)       │
│  • Auth                    │         └──────────────────────────┘
│  • Storage (avatars, images)│
│  • Realtime (notifications,│
│    chat, dashboard events) │
│  • Edge Functions          │
│  • pg_net → email webhook  │
└───────────────────────────┘
                ▲
                │ Static assets
┌───────────────┴─────────────────┐
│  server.mjs (Node HTTP server)   │
│  Serves dist/ + security headers   │
│  Deployed on Railway               │
└───────────────────────────────────┘
```

**Why this shape?**

- **Supabase as BaaS** keeps auth, database, file storage, and realtime in one place with Postgres RLS enforcing authorization at the data layer — not only in the frontend.
- **Edge Functions** handle secrets (PayPal, service role, rate limiting via Upstash Redis) that must never ship in the browser bundle.
- **RPC functions** (`get_listings_page`, `get_home_feed`, `get_jobs_page`) reduce round-trips and let the server assemble complex marketplace payloads in one query.
- **Static SPA + Node server** gives fast CDN-friendly assets, SPA routing via `index.html` fallback, and consistent CSP/security headers in production.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 8, React Router 7, Tailwind CSS 4 |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) |
| Payments | PayPal (`@paypal/react-paypal-js` + server-side order verification) |
| Email | Resend / Gmail SMTP via `send-notification-email` Edge Function |
| Rate limiting | Upstash Redis (Edge Functions) + custom auth rate-limit endpoints |
| Hosting | Railway (`npm run build` → `npm start` via `server.mjs`) |
| E2E tests | Playwright |
| Load tests | k6 (`load-test.js`) |

---

## User types and roles

Every authenticated user has a row in `profiles` with `user_type`:

| Type | Purpose |
|------|---------|
| `freelancer` | Offers services via `services` (listings), applies to jobs, receives inquiries |
| `hirer` | Posts jobs, sends inquiries on listings, manages applicants |

Each type gets an extended profile:

- **`freelancer_profiles`** — slug-based public URL (`/freelancer/:slug`), bio, skills, availability, social links, ratings, portfolio
- **`hirer_profiles`** — company info, industry, jobs posted count, ratings given

**Why split `profiles` from role-specific tables?**

- Shared fields (name, email, avatar, city, phone) live once in `profiles`.
- Role-specific data stays normalized and queryable without nullable columns on a single mega-table.
- RLS policies can join through `freelancer_profiles.user_id` or `hirer_profiles.user_id` to `auth.uid()`.

---

## Application routes

| Route | Access | Purpose |
|-------|--------|---------|
| `/` | Public | Home, search, stats, mixed feed |
| `/browse` | Public | Browse freelancers/categories |
| `/listings` | Public | Service listing marketplace |
| `/listing/:id` | Public | Listing detail + inquiry form (hirers) |
| `/listing/new`, `/listing/:id/edit` | Auth | Create/edit own listings (freelancers) |
| `/jobs` | Public | Job board |
| `/job/:id` | Public | Job detail + apply (freelancers) |
| `/post-job` | Auth | Post/edit jobs (hirers) |
| `/freelancer/:slug` | Public | Freelancer public profile |
| `/hirers`, `/hirer/:id` | Public | Hirer directory and public profile |
| `/login`, `/register` | Public | Authentication |
| `/forgot-password`, `/auth/reset-password` | Public | Password recovery |
| `/onboarding` | Auth | First-time profile setup |
| `/dashboard` | Auth | Role-specific workspace (applications, inquiries, offers) |
| `/profile`, `/settings` | Auth | Account settings |
| `/messages`, `/messages/:conversationId` | Auth | Direct messaging |
| `/saved` | Auth | Bookmarked freelancers, hirers, jobs, services |
| `/cv-generator` | Auth | Build CV from profile data |
| `/cv/:slug` | Public | Public CV page |
| `/checkout` | Dev/E2E only | PayPal checkout diagnostics |

Protected routes use `ProtectedRoute`, which checks `supabase.auth.getUser()` and redirects to `/login` if unauthenticated.

---

## Core user journeys

### Registration and onboarding

1. **Register** (`/register`) — user picks freelancer or hirer, then submits name, email, password, city, optional phone.
2. Supabase Auth creates the user; metadata (`user_type`, `full_name`, etc.) is passed in `signUp` options.
3. A database trigger (`handle_new_user`) creates `profiles` and the appropriate role profile.
4. **Onboarding** (`/onboarding`) — multi-step wizard:
   - **Freelancers**: skills, title, bio, availability, languages, social URLs, avatar, experience, education.
   - **Hirers**: company name, description, industry, website.
5. After onboarding, users land on the dashboard or public profile depending on flow.

**Why onboarding is separate from registration?**

- Keeps signup friction low while still collecting rich marketplace data before listings/jobs go live.
- `is_profile_complete` / `is_public` on freelancer profiles gate discoverability.

### Freelancer: publish a service listing

1. From dashboard or `/listing/new`, freelancer creates a **service** (`services` table).
2. Fields include title, description (with embedded category/tags metadata), price, price type (`fixed` / `hourly` / `monthly`), delivery days, images (Supabase Storage).
3. Listing appears on `/listings` and in home feed when `is_active = true` and profile is public.
4. Hirers can **inquire** → creates `service_inquiries` with message and optional proposed budget.
5. Freelancer accepts/rejects/completes inquiries from the dashboard; status changes trigger notifications.

### Hirer: post a job

1. Authenticated hirer uses `/post-job` to create a **job** (`jobs` table).
2. Job includes title, description, budget range/type, duration, location type, category, skills, vacancies, contact preference, optional images.
3. Freelancers browse `/jobs` and **apply** → `job_applications` with cover note.
4. Hirer accepts/rejects applicants from dashboard; accepted applications can expose contact details per `contact_preference`.
5. Job lifecycle: open → in progress → completed; completion creates `completed_jobs` and opens a review window.

### Reviews and completed work

- When a job completes, both parties can confirm via `completed_jobs`.
- **Reviews** (`reviews`) can be left within a review window; they update `average_rating` on freelancer profiles via `update_freelancer_rating`.
- Freelancers can optionally show completed service titles on their public profile.

**Why dual confirmation?**

- Reduces fake completions and gives both sides a clear moment to leave feedback.

### Discovery and engagement

- **Home feed** (`get_home_feed` RPC / Edge Function): mixed freelancer services and hirer jobs, VIP-boosted items surfaced prominently.
- **Search** on home routes freelancers to `/jobs` and everyone else to `/listings` by default.
- **Follows** (`follows`): users follow profile IDs; counts shown on dashboard.
- **Saved items** (`user_saved_items`): bookmark freelancers, hirers, jobs, or services.
- **Profile visits** (`profile_visits`): track unique hirer visitors to freelancer profiles for analytics.

---

## Marketplace model: two sides of the platform

Gigori runs two parallel marketplaces that mirror each other:

| Freelancer side | Hirer side |
|-----------------|------------|
| **Service listing** (`services`) | **Job posting** (`jobs`) |
| Hirer sends **inquiry** | Freelancer sends **application** |
| Dashboard: manage inquiries | Dashboard: manage applicants |
| VIP on listing (`services.is_vip`) | VIP on job (`jobs.is_vip`) |
| Public profile by slug | Public profile by hirer ID |

**Why two flows instead of one generic "project"?**

- Job postings need vacancies, deadlines, application counts, and hirer contact rules — different from fixed-price service catalogs.
- Service listings emphasize portfolio, price types, and delivery — optimized for hirers browsing talent.
- Separate tables and dashboards keep UX and RLS policies clear for each role.

---

## Database design

### Core tables

| Table | Role |
|-------|------|
| `profiles` | Base user: email, name, avatar, city, phone, `user_type`, `cv_url` |
| `freelancer_profiles` | Extended freelancer public identity (slug, bio, ratings, social URLs) |
| `hirer_profiles` | Company/organization profile |
| `services` | Freelancer service listings (price, images, VIP, views) |
| `jobs` | Hirer job posts (budget, vacancies, VIP, contact preference) |
| `service_inquiries` | Hirer → freelancer interest on a listing |
| `job_applications` | Freelancer → hirer application on a job |
| `completed_jobs` | Completion record linking job, hirer, freelancer |
| `reviews` | Post-completion ratings and comments |
| `categories` / `subcategories` / `skills` | Taxonomy for filtering and onboarding |
| `freelancer_skills` | Many-to-many skills with level |
| `experience` / `freelancer_education` | CV and profile enrichment |
| `portfolio_items` | Freelancer portfolio pieces |
| `notifications` | In-app alerts with optional email dispatch |
| `conversations` / `messages` / `conversation_reads` | Chat |
| `follows` | Social follow graph |
| `user_saved_items` | Bookmarks |
| `profile_visits` | Freelancer profile view analytics |
| `vip_payments` | PayPal payment audit trail for VIP purchases |
| `reports` | User-submitted reports on content |

### Important RPCs and triggers

| Function | Purpose |
|----------|---------|
| `get_listings_page()` | Bundled services + categories + skills for listings page |
| `get_jobs_page(...)` | Paginated job board payload |
| `get_home_feed(...)` | Mixed feed for homepage |
| `get_or_create_conversation(...)` | Chat thread creation with context validation |
| `get_chat_inbox_message_stats(...)` | Unread counts for inbox |
| `increment_service_views` / `increment_job_views` | View counters |
| `handle_new_user` | Profile bootstrap on signup |
| `handle_job_completion` / `handle_job_posted` | Job lifecycle side effects |
| `notify_via_email` | Trigger on notification INSERT → HTTP to Edge Function |
| `send_status_notification` | Standardized in-app notification inserts |

**Why SECURITY DEFINER RPCs?**

- Public marketplace pages need aggregated data across tables without exposing overly permissive SELECT policies.
- Complex joins and pagination stay in Postgres for performance and consistency.

---

## Row Level Security (RLS)

Authorization is enforced in PostgreSQL, not only in React:

- Users read/update **their own** `profiles`, notifications, saved items, conversation reads.
- **Hirers** update applications and jobs they own (via `hirer_profiles.user_id = auth.uid()`).
- **Freelancers** manage their services, applications, and inquiry responses on their listings.
- **Reviews** are insertable by authenticated users as reviewer; readable when user is reviewer or reviewee.
- **Chat** uses `is_conversation_participant()` helper; `get_or_create_conversation` verifies job application or service inquiry participation before linking context.

**Why RLS matters here**

- The Supabase anon key is public in the browser. RLS is the real security boundary.
- Edge Functions use the service role only where necessary (public feeds, PayPal activation, email), with rate limits and input validation.

---

## Supabase Edge Functions

| Function | Purpose |
|----------|---------|
| `auth-login` | Rate-limited login proxy; returns session tokens |
| `auth-rate-limit` | Register/recover/reauth attempt counting |
| `get-listings-page` | Cached listings payload (Redis, 30s TTL) |
| `get-jobs-page` | Paginated jobs with caching |
| `get-home-feed` | Homepage feed |
| `get-homepage-vip` | VIP-highlighted items for homepage |
| `activate-vip` | Verify PayPal order, set VIP on job or listing |
| `paypal-capture` | PayPal capture helper |
| `send-notification-email` | Email delivery for notifications |
| `cv-get` / `cv-update` | CV slug read/update (server-side) |
| `cv-generate` | **Disabled (410)** — CV is built client-side from profile |
| `health` | Health check |

Shared modules in `supabase/functions/_shared/`:

- **`cors.ts`** — origin allowlist via `ALLOWED_ORIGINS`
- **`rateLimit.ts`** — Upstash Redis sliding windows
- **`validation.ts`** — request parsing and sanitization

**Why proxy login through an Edge Function?**

- Brute-force protection (IP + email keyed limits) without exposing service role to the client.
- Consistent 429 / `Retry-After` behavior the UI can show as Georgian cooldown messages.

---

## Realtime and notifications

### In-app notifications

1. Business logic inserts into `notifications` (title, body, link, type, optional JSON `payload`).
2. `notifications` is on the **Supabase Realtime** publication — navbar subscribes for live inserts/updates.
3. Client helpers in `src/lib/notifications.ts` fetch, mark read, and subscribe.

### Email notifications

1. Postgres trigger `on_notification_created` calls `notify_via_email()`.
2. Uses **pg_net** to POST to `send-notification-email` with service role auth.
3. Requires DB settings: `app.edge_function_url`, `app.service_role_key` (and optional `app.email_webhook_secret`).

**Why DB-triggered email?**

- Any code path that inserts a notification automatically gets email — no duplicate logic in frontend and Edge Functions.
- Failures in email do not block the in-app notification insert.

### Other realtime channels

- **Chat** — new messages and read receipts (`src/lib/chatRealtime.ts`)
- **Dashboard messaging** — inquiry/application updates (`src/lib/dashboardMessagingRealtime.ts`)
- **Service inquiries / job applications** — realtime subscriptions for live dashboard tabs

---

## VIP / featured placement (PayPal)

VIP promotes jobs or service listings for increased visibility (badges, feed priority, homepage VIP section).

### Pricing (customer-facing GEL, PayPal charged in USD)

| Tier | GEL | Duration | USD (÷ 2.75) |
|------|-----|----------|----------------|
| Bronze | ₾10 | 7 days | ~$3.64 |
| Silver | ₾20 | 14 days | ~$7.27 |
| Gold | ₾30 | 30 days | ~$10.91 |

Defined in `src/lib/vipJobTiers.ts` and mirrored in `supabase/functions/activate-vip/index.ts`.

### Flow

1. User initiates PayPal checkout in the browser (PayPal JS SDK).
2. On approval, client calls `activate-vip` with order ID and target (job or listing) + tier.
3. Edge Function verifies payment with PayPal API, records `vip_payments`, sets `is_vip` + `vip_expires_at` on `jobs` or `services`.
4. `jobVipIsActive()` / listing equivalent gates UI badges and sort priority.

**Why USD via PayPal while displaying GEL?**

- PayPal sandbox/production GEL support is limited; fixed conversion keeps client display and server validation aligned.

---

## Messaging (chat)

- **Conversations** are 1:1 between two `profiles.id` values, stored with ordered pair `(participant_low, participant_high)` to prevent duplicates.
- Optional context link: exactly one of `job_application_id` or `service_inquiry_id`.
- **Messages** are plain text bodies with RLS restricting read/write to participants.
- **Read receipts** via `conversation_reads.last_read_at`; UI shows "გაგზავნილია" / "წაკითხულია".
- Entry points: `StartConversationButton` on job/listing flows, `/messages?with=...&inquiry=...`.

**Why context-linked conversations?**

- Keeps hiring discussions tied to a specific application or inquiry for support and clarity, while still allowing a general direct thread between two users.

---

## CV generator and public CV pages

- **No AI generation** — the `cv-generate` Edge Function returns HTTP 410; CVs are assembled from existing profile data.
- **`/cv-generator`** (auth): freelancer edits CV sections derived from profile, experience, education, skills.
- **`/cv/:slug`**: public shareable CV; also available via Next-style route stub at `app/cv/[slug]/page.jsx` for SSR/SEO experiments.
- **`cv-get` / `cv-update` Edge Functions** and `profiles.cv_url` store the public slug/URL.

**Why profile-driven CVs?**

- Single source of truth — no drift between profile and CV.
- Avoids AI cost, latency, and content moderation issues for a marketplace CV.

---

## Security model

### Client vs server secrets

| Location | Allowed |
|----------|---------|
| `VITE_*` env vars | Supabase URL, anon key, PayPal **client ID** only |
| Supabase Edge secrets | Service role, PayPal secret, SMTP, Redis, webhook secrets |

Never commit `.env`. See `.env.example` for the full list.

### Auth hardening

- Login via `auth-login` Edge Function with rate limits.
- Register/recover via `auth-rate-limit` before Supabase Auth calls.
- 15-minute cooldown UI on repeated failures (`AUTH_COOLDOWN_MS`).

### HTTP security headers

`security/csp.mjs` defines CSP, HSTS, `X-Frame-Options`, etc. Applied by:

- Vite dev/preview server
- Production `server.mjs`
- Generated `dist/_headers` for static hosts

PayPal domains are allowlisted in CSP for scripts, frames, and connect.

### Input validation

Centralized in `src/lib/validation.ts` (length limits, email, password, money amounts, inquiry messages). Edge Functions duplicate critical checks in `_shared/validation.ts`.

### Database hardening

Migrations `20260519160000_security_hardening.sql` and `20260519170000_security_remaining.sql` tighten conversation authorization, text length checks, and related policies.

### CI

`.github/workflows/gitleaks.yml` scans for leaked secrets.

---

## Frontend architecture

### Entry and routing

- `src/main.tsx` mounts `App.tsx` with `BrowserRouter`.
- Pages are **lazy-loaded** (`React.lazy`) with `Suspense` + `PageLoader` for code splitting.
- Georgian copy is inline in components (no i18n framework yet).

### Data access pattern

- Direct Supabase client queries from pages/components for user-specific CRUD.
- Public/heavy list endpoints go through Edge Functions + RPCs for caching and payload shaping.
- Types from `src/types/database.types.ts` (and re-export `src/lib/database.types.ts`).

### Key shared libraries (`src/lib/`)

| Module | Responsibility |
|--------|----------------|
| `supabase.ts` | Client singleton |
| `authRateLimit.ts` | Login/register throttling |
| `validation.ts` | Form validation rules |
| `listingPrice.ts` / `listingDescription.ts` | Price formatting, embedded listing metadata |
| `marketplaceFilters.ts` / `marketplaceCategoryTree.ts` | Category and location filters |
| `homeFeed.ts` | Home feed loading |
| `chat.ts` / `chatRealtime.ts` | Messaging |
| `notifications.ts` | Notification fetch + realtime |
| `savedItems.ts` / `follows.ts` | Engagement features |
| `storageImageUrl.ts` | Supabase Storage public URLs with transforms |
| `vipJobTiers.ts` | VIP pricing helpers |

### UI components

- `Navbar` — auth state, notifications, navigation
- `Footer`, `VIPUpgrade`, `SaveBookmarkButton`, `StartConversationButton`
- UI primitives: `PageLoader`, `SkeletonCard`, `EmptyState`, `ErrorState`, `ToastProvider`

### Styling

- Tailwind CSS 4 via `@tailwindcss/vite`
- Brand colors: primary blue `#0088FF`, navy `#1B2B4B`, gold accent `#D4A843`
- Responsive layouts with mobile-first patterns on marketplace cards

---

## Deployment and operations

### Railway

`railway.toml`:

```toml
[build]
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
```

- **Build**: `tsc -b && vite build` → output in `dist/`
- **Start**: `node server.mjs` serves `dist/` on `PORT` (default 3000)

### Supabase

- SQL migrations in `supabase/migrations/` — apply via Supabase CLI or dashboard.
- Edge Functions deployed separately (`supabase functions deploy`).
- Configure secrets and DB settings (`app.edge_function_url`, etc.) in Supabase dashboard.

### Static headers

`public/_headers` and build-generated `dist/_headers` for platforms that read them (Netlify/Cloudflare-style).

---

## Local development

1. Copy `.env.example` → `.env` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PAYPAL_CLIENT_ID` (optional; VIP checkout disabled without it)

2. Install and run:

```bash
npm install
npm run dev
```

3. Vite dev server runs with security headers and CSP (including `'unsafe-eval'` in dev for HMR).

4. For production-like serving:

```bash
npm run build
npm start
```

5. Supabase Edge Functions are developed/deployed with the Supabase CLI against your project.

---

## Testing and load testing

| Tool | Command | Purpose |
|------|---------|---------|
| Playwright | `npm run test:e2e` | E2E flows including PayPal sandbox (`PayPalCheckoutE2E.tsx`, `/checkout` in dev) |
| k6 | `k6 run -e SUPABASE_FUNCTIONS_URL=... -e SUPABASE_ANON_KEY=... load-test.js` | Edge Function load testing |

---

## Project directory layout

```
gigori/
├── src/
│   ├── App.tsx              # Routes, home/login/register
│   ├── main.tsx
│   ├── pages/               # Route-level screens (21 pages)
│   ├── components/          # Reusable UI and feature components
│   ├── lib/                 # Business logic, Supabase helpers, validation
│   └── types/               # Database TypeScript types
├── supabase/
│   ├── migrations/          # Postgres schema, RLS, RPCs, triggers
│   └── functions/           # Deno Edge Functions
├── security/
│   └── csp.mjs              # CSP and security headers
├── app/cv/[slug]/           # Optional CV route stub
├── components/cv/           # CV preview components
├── lib/ai/gemini.js         # Legacy/server AI helper (CV gen disabled)
├── public/                  # Static assets, _headers
├── server.mjs               # Production static file server
├── load-test.js             # k6 script
├── vite.config.ts
├── railway.toml
└── .env.example
```

---

## Design principles and rationale

1. **Georgian-first marketplace** — UI, notifications, and category names prioritize `ka` locale; architecture supports `name_en` for future expansion.

2. **Postgres as the source of truth** — Ratings, counts, VIP expiry, and completion state live in the database with triggers/RPCs, not only client-side state.

3. **Thin frontend, smart backend** — List pages and feeds use RPCs/Edge Functions to avoid N+1 queries and to cache hot paths.

4. **Security in depth** — RLS + Edge Function secrets + CSP + auth rate limits + gitleaks CI.

5. **Role-native UX** — Freelancers and hirers get different dashboards, search defaults, and action buttons, reflecting how each side actually uses a freelance marketplace.

6. **Trust and discovery loops** — Reviews, completed jobs, profile visits, follows, saves, VIP promotion, and view counts reinforce quality and engagement.

7. **Pragmatic payments** — PayPal USD capture with GEL display matches regional payment reality without blocking the VIP monetization path.

---

## Related files

- **Environment variables**: `.env.example`
- **Existing readme stub**: `README.md` (Vite template + env notes)
- **Type definitions**: `src/types/database.types.ts`
- **VIP pricing sync**: `src/lib/vipJobTiers.ts` ↔ `supabase/functions/activate-vip/index.ts`

---

*Last updated to reflect the codebase as of May 2026.*
