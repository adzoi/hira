# Validation rule inventory

Cross-layer audit of validation in **Client** (`src/lib/validation.ts`, `src/lib/uploadValidation.ts`, and inline page checks), **Edge** (`supabase/functions/_shared/validation.ts` and per-function usage), and **Postgres** (schema, `CHECK` constraints, `NOT NULL`, FKs, storage bucket limits, RPC guards).

**Classification**

| Label | Meaning |
|-------|---------|
| **Security-critical** | Prevents bad data, DoS via oversized input, referential-integrity violations, or injection/open-redirect. Should be enforced at the database where the data is stored. |
| **UX-only** | Minimum lengths, friendly formats, early feedback. Helpful on client/edge but not the last line of defense. |

**Layer key:** ✅ = enforced · ⚠️ = partial/indirect · — = not present

---

## Shared primitives

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Strip `<>`, NUL, C0 controls (keep `\n\r\t`) | All text via `sanitizePlainText` | ✅ | ✅ | — | Security-critical | No DB equivalent; stored text can still contain markup if client bypassed. |
| `escapeHtml` | Email templates (edge) | ✅ | ✅ | — | Security-critical | Output encoding only; not a storage constraint. |
| UUID format (RFC-style regex, max 36) | Route params, chat, webhooks | ✅ | ✅ | — | UX-only | Invalid UUIDs fail FK lookups; format regex is client/edge convenience. |
| JSON body max 256 KB | Edge function POST bodies | — | ✅ | — | Security-critical | Edge-only DoS guard (`readJsonBody`). |
| JSON body must be object | Edge function POST bodies | — | ✅ | — | Security-critical | Edge-only. |
| Pagination page ≥ 1, capped at 500 | `get-jobs-page`, `get-listings-page` | — | ✅ | — | Security-critical | Edge-only; limits RPC load. |
| Search query max 100 chars | Jobs/listings/home/browse | ✅ | ✅ | — | Security-critical | Edge truncates inline; client uses `validateSearchQuery` / `normalizeSearchInput`. |
| Category filter sanitized, max 36 chars | Edge catalog RPCs | — | ✅ | — | Security-critical | Edge-only (`normalizeCategory`). |
| Internal path: `^/[a-zA-Z0-9/_-]*$`, no `//`, no `http(s)://` | Notification links, navbar redirects | ✅ | ⚠️ RPC | Security-critical | `send_status_notification` RPC validates link pattern; `notifications.link` column has no `CHECK`. |
| Optional URL: max 2048, `http`/`https` only, valid hostname | Profile social/website, CV URLs | ✅ | ✅ | — | Security-critical | URL columns (`linkedin_url`, `website_url`, etc.) have no length or scheme checks in Postgres. |
| Money amount finite, ≥ min, ≤ 999_999_999 | Budgets, prices, proposed rates | ✅ | — | — | Security-critical | `jobs.budget_*`, `services.price`, `service_inquiries.proposed_budget` are unconstrained `numeric`. |
| Positive integer in range | Job vacancies (1–100) | ✅ | — | ⚠️ | Security-critical | DB: `vacancies >= 1` only; no upper bound. |
| Tags: max 20 items, each max 50 chars, deduped | Listing form (embedded in description) | ✅ | — | — | Security-critical | Tags are not a DB column; limits only affect composed description length (see listing description max). |

---

## Auth & account

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Email required | Login, register, forgot password, rate-limit | ✅ | ✅ | ⚠️ | UX-only | `profiles.email NOT NULL`; format not checked in DB. Supabase Auth validates on signup. |
| Email max 254 chars | Auth forms | ✅ | ✅ | — | Security-critical | Auth layer; not on `profiles.email`. |
| Email format regex | Auth forms | ✅ | ✅ | — | UX-only | Supabase Auth enforces on registration. |
| Password required | Login | ✅ | ✅ | — | UX-only | Auth provider. |
| Password max 128 chars | Login, register, reset | ✅ | ✅ | — | Security-critical | DoS guard on auth endpoints. |
| Password min 8 + uppercase + digit | Register, reset, profile change | ✅ | ✅ | — | UX-only | Auth provider policy; not in DB. |
| Full name required, min 2, max 120 | Register, profile | ✅ | ⚠️ CV edge | ✅ max | Mixed | DB has max length only; min 2 is UX. CV edge validates full name on write. |
| City max 100 | Register | ✅ | — | ✅ | Security-critical | |
| Phone optional, max 32 | Register | ✅ | — | ✅ | Security-critical | |
| Avatar upload max 5 MB | Profile, onboarding | ✅ | — | ⚠️ | Security-critical | Storage RLS on `avatars` bucket; bucket `file_size_limit` not set in migrations (policy-only). |
| Avatar mime: JPEG, PNG, WebP | Profile, onboarding | ✅ | — | ⚠️ | Security-critical | Client-only mime check; bucket `allowed_mime_types` not in migrations. |

---

## Profiles — freelancer

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Bio max 5000 | Profile, onboarding | ✅ | — | ✅ | Security-critical | |
| Bio min 50 | Onboarding (inline check) | ✅ | — | — | UX-only | |
| Professional title max 120 | Profile (no validator on input), limits constant | ⚠️ | — | ✅ | Security-critical | UI does not call `validateTextField`; DB max still applies on insert/update. |
| Professional title required | Onboarding (inline) | ✅ | — | — | UX-only | |
| Slug NOT NULL UNIQUE | Freelancer profile | — | — | ✅ | Security-critical | Generated in app; no format/length `CHECK` (client `LIMITS.slug` = 80 unused here). |
| Social / portfolio URLs | Profile | ✅ | — | — | Security-critical | See optional URL rule; columns unconstrained in DB. |
| CV PDF max 10 MB | Freelancer profile | ✅ | — | ⚠️ | Security-critical | `cvs` bucket owner RLS; no bucket size/mime in migrations. |
| CV PDF mime `application/pdf` | Freelancer profile | ✅ | — | ⚠️ | Security-critical | Client-only. |
| Experience max 10 rows | Profile save (inline) | ✅ | — | — | Security-critical | No DB limit on row count per profile. |
| Experience: title, org, dates required | Profile save (inline) | ✅ | — | ⚠️ | UX-only | DB: `title`, `organization`, `start_date NOT NULL`; end date optional. |
| Experience title max 120 | `LIMITS.experienceTitle` | ⚠️ | — | — | Security-critical | Constant exists; Profile save does not enforce max length. |
| Experience description | Profile save | — | — | — | Security-critical | No max length in client or DB. |
| Education max 10 rows | Profile save (inline) | ✅ | — | — | Security-critical | No DB row-count limit. |
| Education institution max 200 | `LIMITS.educationInstitution` | ⚠️ | — | — | Security-critical | Constant exists; not enforced in Profile save. |
| Education degree_level enum | Profile save | ✅ | — | ✅ | Security-critical | DB: `bachelor`, `master`, `doctorate`, `diploma`, `vocational`, `other`. |
| Education field_of_study, end_date required | Profile save (inline) | ✅ | — | ⚠️ | UX-only | DB allows NULL on `field_of_study`, `end_date`. |

---

## Profiles — hirer

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Company name max 120 | Onboarding, profile | ✅ | — | ✅ | Security-critical | |
| Company description max 5000 | Onboarding, profile | ✅ | — | ✅ | Security-critical | |
| Company description min 30 | Onboarding, profile | ✅ | — | — | UX-only | |
| Website URL optional, https | Onboarding, profile | ✅ | — | — | Security-critical | `hirer_profiles.website_url` unconstrained in DB. |

---

## Jobs

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Title max 100 | Post/edit job | ✅ | — | ✅ | Security-critical | |
| Title min 3 | Post/edit job | ✅ | — | — | UX-only | |
| Title EN max 100 | Bilingual jobs | ✅ | — | ✅ | Security-critical | |
| Description max 20_000 | Post/edit job | ✅ | — | ✅ | Security-critical | |
| Description min 100 | Post/edit job | ✅ | — | — | UX-only | |
| Description EN max 20_000 | Bilingual jobs | ✅ | — | ✅ | Security-critical | |
| Budget min/max ≥ 0, max ≥ min | Post job (inline) | ✅ | — | — | Security-critical | No `CHECK` on `budget_min`/`budget_max`. |
| Budget amounts ≤ 999_999_999 | `validateMoneyAmount` (not used on PostJob) | ⚠️ | — | — | Security-critical | PostJob uses inline `Number()` without upper cap. |
| Vacancies integer 1–100 | Post job | ✅ | — | ⚠️ | Security-critical | DB: `vacancies >= 1` only. |
| Accepted count ≥ 0 | — | — | — | ✅ | Security-critical | |
| Contact preference ∈ {email, phone, both} | Post job | ⚠️ UI | — | ✅ | Security-critical | |
| Image URLs max 3 | Post job | ✅ | — | ✅ | Security-critical | `cardinality(image_urls) <= 3`. |
| Job image upload max 10 MB, image/* | Post job (inline) | ✅ | — | ✅ | Security-critical | Storage bucket `file_size_limit = 10485760`, mime allow-list. |
| Job image count max 3 | Post job | ✅ | — | ✅ | Security-critical | |

---

## Services (listings)

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Title max 120 | Listing form | ✅ | — | ✅ | Security-critical | |
| Title min 3 | Listing form | ✅ | — | — | UX-only | |
| Title EN max 120 | Listing form | ✅ | — | ✅ | Security-critical | |
| Description max 20_000 | Listing form | ✅ | — | ✅ | Security-critical | Column nullable in schema. |
| Description min 10 | Listing form | ✅ | — | — | UX-only | |
| Description EN max 20_000 | Listing form | ✅ | — | ✅ | Security-critical | |
| Price ≥ 1 when not negotiable | Listing form | ✅ | — | — | Security-critical | `services.price NOT NULL DEFAULT 0`; no `CHECK`. |
| Price ≤ 999_999_999 | Listing form via `validateMoneyAmount` | ✅ | — | — | Security-critical | |
| Price type ∈ {fixed, hourly, monthly} | Listing form | ⚠️ UI | — | ✅ | Security-critical | |
| Image URLs max 3 | Listing form | ✅ | — | ✅ | Security-critical | |
| Service image upload max 10 MB, image/* | Listing form (inline) | ✅ | — | ✅ | Security-critical | Storage bucket limits. |

---

## Job applications & inquiries

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Cover note max 5000 | Job detail apply | ✅ | — | ⚠️ | Security-critical | DB allows 5500 (`job_applications_cover_note_max_length`); client stricter. |
| Cover note min 50 when provided | Job detail | ✅ | — | — | UX-only | Optional field. |
| Inquiry message max 5000 | Listing detail, listings modal | ✅ | — | ✅ | Security-critical | |
| Inquiry message min 10 | Listing detail, listings modal | ✅ | — | — | UX-only | |
| Proposed budget ≥ 0, finite | Inquiry/offer flows | ✅ | — | — | Security-critical | `proposed_budget numeric` unconstrained. |
| Unique (job_id, freelancer_profile_id) | Applications | — | — | ✅ | Security-critical | Referential integrity. |

---

## Chat & attachments

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Message body max 4000 | Messages, `chat.ts` | ✅ | — | ✅ | Security-critical | Applies when `body IS NOT NULL`. |
| Message body min 1 (or empty with attachment) | Messages, `chat.ts` | ✅ | — | ✅ | Security-critical | `messages_has_content_or_attachment`. |
| Attachment size max 15 MB | Chat upload | ✅ | — | ✅ | Security-critical | Column `attachment_size_bytes` + storage bucket limit. |
| Attachment mime allow-list | Chat upload | ✅ | — | ✅ | Security-critical | Storage bucket `allowed_mime_types`. |
| Attachment extension must match mime | Chat upload | ✅ | — | — | Security-critical | Client-only; storage bucket does not verify extension. |
| Attachment filename max 200, sanitized | Chat upload | ✅ | — | — | Security-critical | `attachment_name` column has no length `CHECK`. |
| Attachment required fields when present | — | — | — | ⚠️ | Security-critical | No `CHECK` tying `attachment_url` / `attachment_name` / `attachment_type` together. |
| Conversation participants ordered (low < high) | Conversations | — | — | ✅ | Security-critical | |
| One context per conversation (job XOR inquiry) | Conversations | — | — | ✅ | Security-critical | |
| Participant must be conversation member | Message insert | — | — | ⚠️ RLS | Security-critical | RLS policies, not `CHECK`. |

---

## Reviews

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Review text max 2000 | Dashboard | ✅ | — | ✅ | Security-critical | |
| Review text min 10 | Dashboard | ✅ | — | — | UX-only | |
| Ratings 1–5 (all four dimensions) | Dashboard (inline) | ✅ | — | — | Security-critical | `rating_* smallint NOT NULL` with no range `CHECK`. |
| Reviewer ≠ reviewee | Review insert | — | — | ⚠️ RLS | Security-critical | Policy `reviewee_id <> reviewer_id`. |
| Review insert authorized participant | Review insert | — | — | ⚠️ RLS/RPC | Security-critical | `can_user_insert_review` security definer. |

---

## Forum

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Post title max 200, min 3 | Forum post form | ✅ | — | ✅ | Mixed | DB: not blank + max; min 3 is UX-only. |
| Post body max 20_000, min 10 | Forum post form | ✅ | — | ✅ | Mixed | DB: not blank + max. |
| Comment max 4000, min 1 | Forum post detail | ✅ | — | ✅ | Mixed | DB: not blank + max. |
| Author name max 120 | Set on insert from profile | — | — | ✅ | Security-critical | |
| Category / subcategory not blank | Forum posts | ⚠️ UI | — | ✅ | Security-critical | |

---

## Notifications

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Title max 200 | Edge email webhook | — | ✅ | ⚠️ RPC | Security-critical | `send_status_notification` validates; `notifications.title NOT NULL` but no max `CHECK`. Direct INSERT revoked for clients. |
| Body max 2000 | Edge email webhook | — | ✅ | ⚠️ RPC | Security-critical | Same as title; column nullable in schema. |
| Link max 2048, internal path rules | Navbar, RPC | ✅ | ⚠️ RPC | — | Security-critical | Column unconstrained. |
| Payload jsonb default `{}` | Notifications | — | — | ✅ | Security-critical | No size limit on `payload`. |

---

## CV editor (edge `cv-update`)

| Rule | Target / context | Client | Edge | Postgres | Class | Notes |
|------|------------------|:------:|:----:|:--------:|-------|-------|
| Full name min 2, max 120 | CV update | — | ✅ | ⚠️ | Mixed | Validated on edge; stored in `user_cvs` (schema not in repo migrations). |
| Email optional, validated if present | CV update | — | ✅ | — | UX-only | |
| Professional summary max 5000 | CV update | — | ✅ | — | Security-critical | Edge sanitizes; `user_cvs` columns lack length checks in migrations. |
| Custom slug max 80 | CV update | — | ✅ | — | Security-critical | |
| URL fields max 2048, https | CV update | — | ✅ | — | Security-critical | |
| Work/education/skills arrays max 30 items | CV update | — | ✅ | — | Security-critical | |
| Each array item serialized ≤ 2000 chars | CV update | — | ✅ | — | Security-critical | |

---

## Storage buckets (Postgres `storage.buckets`)

| Rule | Bucket | Client | Edge | Postgres | Class | Notes |
|------|--------|:------:|:----:|:--------:|-------|-------|
| Max 15 MB + mime allow-list | `chat-attachments` | ✅ | — | ✅ | Security-critical | |
| Max 10 MB + JPEG/PNG/WebP | `job-images` | ✅ | — | ✅ | Security-critical | |
| Max 10 MB + JPEG/PNG/WebP | `service-images` | ✅ | — | ✅ | Security-critical | |
| Owner-only path (`auth.uid()` folder) | `avatars`, `cvs` | — | — | ✅ RLS | Security-critical | Size/mime not set on bucket rows in migrations. |

---

## Referential integrity & invariants (Postgres-only)

| Rule | Target | Client | Edge | Postgres | Class | Notes |
|------|--------|:------:|:----:|:--------:|-------|-------|
| FK: profiles → auth.users | profiles.id | — | — | ✅ | Security-critical | |
| FK: all profile-owned entities | Many tables | — | — | ✅ | Security-critical | Standard CASCADE/SET NULL. |
| Follower ≠ following | follows | — | — | ✅ | Security-critical | |
| Profile visit: exactly one of freelancer/hirer target | profile_visits | — | — | ✅ | Security-critical | |
| Saved item resource_type enum | user_saved_items | — | — | ✅ | Security-critical | |
| Service inquiry message NOT NULL | service_inquiries | — | — | ✅ | Security-critical | Length max enforced separately. |

---

## Summary: security-critical gaps (Postgres missing today)

These rules are **security-critical** in client and/or edge but **not** fully enforced on the corresponding Postgres columns/tables. A follow-up migration should add `CHECK`, `NOT NULL`, or domain types for these (client/edge checks remain for UX).

| Priority | Rule | Table / column |
|----------|------|----------------|
| High | Rating dimensions ∈ [1, 5] | `reviews.rating_overall`, `rating_quality`, `rating_communication`, `rating_timeliness` |
| High | Notification title max 200, body max 2000 | `notifications.title`, `notifications.body` |
| High | Notification link internal path + max length | `notifications.link` |
| High | URL columns max 2048 | `freelancer_profiles.*_url`, `hirer_profiles.website_url`, `profiles.cv_url`, `portfolio_items.project_url`, etc. |
| High | Money bounds 0 … 999_999_999 | `jobs.budget_min`, `jobs.budget_max`, `services.price`, `service_inquiries.proposed_budget` |
| High | Vacancies upper bound (100) | `jobs.vacancies` |
| Medium | Job/listing title & description minimum lengths | `jobs.title`, `jobs.description`, `services.title`, `services.description` |
| Medium | Inquiry message min length (10) | `service_inquiries.message` |
| Medium | Cover note align max 5000 (or raise client to 5500) | `job_applications.cover_note` |
| Medium | Chat attachment name max 200 | `messages.attachment_name` |
| Medium | Experience/education field max lengths & row counts | `experience.*`, `freelancer_education.*` |
| Medium | Services price ≥ 0 (or ≥ 1 when active) | `services.price` |
| Medium | Payload jsonb size cap | `notifications.payload` |
| Lower | Freelancer slug format/length | `freelancer_profiles.slug` |
| Lower | Align cover note / review text minimums if desired as spam control | various text columns |

**Already enforced in Postgres (no migration needed for max-length DoS):** messages body, jobs/services titles & descriptions (incl. EN), service inquiry message, review text, profile & hirer/freelancer profile text fields, forum posts/comments, chat attachment size, image URL cardinality, enums for `price_type`, `contact_preference`, `degree_level`, conversation invariants.

**Cannot be replicated in Postgres:** `sanitizePlainText`, HTML escaping, file mime/extension cross-check at upload time (storage bucket mime is the DB-layer defense), password complexity, email regex (auth provider), client-side pagination/search UX.

---

*Generated from repo state: client `src/lib/validation.ts`, edge `supabase/functions/_shared/validation.ts`, and migrations under `supabase/migrations/`.*
