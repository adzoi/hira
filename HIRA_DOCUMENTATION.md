# Hira (ჰირა) — Comprehensive Platform Documentation

**Hira** (ჰირა) is a Georgian-language freelance marketplace platform that connects **freelancers** (specialists offering services) with **hirers** (clients posting jobs or buying services). This document provides a comprehensive description of every aspect of the platform—its purpose, architecture, features, functionality, and implementation details.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What Problem Hira Solves](#what-problem-hira-solves)
3. [Platform Overview](#platform-overview)
4. [User Types and Roles](#user-types-and-roles)
5. [High-Level Architecture](#high-level-architecture)
6. [Technology Stack](#technology-stack)
7. [Application Routes and Pages](#application-routes-and-pages)
8. [Core Features and Functionality](#core-features-and-functionality)
9. [Marketplace Model](#marketplace-model)
10. [Database Design](#database-design)
11. [Authentication and Security](#authentication-and-security)
12. [Real-time Features](#real-time-features)
13. [Payment System (VIP/Featured Placements)](#payment-system-vipfeatured-placements)
14. [Messaging System](#messaging-system)
15. [CV Generator](#cv-generator)
16. [Forum System](#forum-system)
17. [Notifications](#notifications)
18. [Analytics](#analytics)
19. [Internationalization (i18n)](#internationalization-i18n)
20. [Edge Functions (Serverless)](#edge-functions-serverless)
21. [Frontend Architecture](#frontend-architecture)
22. [Security Implementation](#security-implementation)
23. [File Storage](#file-storage)
24. [Deployment and Operations](#deployment-and-operations)
25. [Development Environment](#development-environment)
26. [Testing](#testing)
27. [Environment Variables](#environment-variables)
28. [Project Directory Structure](#project-directory-structure)
29. [Design Principles](#design-principles)

---

## Executive Summary

Hira is a full-featured, production-ready freelance marketplace built as a modern single-page application (SPA). Key characteristics:

- **Target Market**: Georgian freelance economy
- **Primary Language**: Georgian (ქართული), with bilingual data support
- **Architecture**: React SPA + Supabase Backend-as-a-Service (BaaS)
- **Monetization**: PayPal-based VIP/featured placement subscriptions
- **Deployment**: Railway (static server) + Supabase Cloud

---

## What Problem Hira Solves

The Georgian freelance market lacks a dedicated, localized platform. Hira addresses this gap by providing:

### For Freelancers
- **Service Listings**: Publish what they offer with pricing (fixed/hourly/monthly)
- **Public Profiles**: Slug-based URLs (`/freelancer/:slug`) with portfolio, skills, reviews
- **Job Discovery**: Browse and apply to job postings from hirers
- **CV Generation**: Build professional CVs from profile data
- **Trust Building**: Reviews, completed work history, profile visit analytics

### For Hirers
- **Job Postings**: Create job vacancies with budgets, skills, and contact preferences
- **Talent Discovery**: Browse freelancer profiles and service listings
- **Applicant Management**: Dashboard to review, accept, or reject applicants
- **Direct Inquiries**: Send inquiries on service listings

### For Both Sides
- **Search & Discovery**: Category-based browsing, search, home feed
- **Messaging**: Direct 1:1 chat linked to applications/inquiries
- **Bookmarks**: Save freelancers, hirers, jobs, and services
- **VIP Promotion**: Pay for featured placement to increase visibility

---

## Platform Overview

### Two-Sided Marketplace

| Freelancer Side | Hirer Side |
|-----------------|------------|
| Service listings (`services`) | Job postings (`jobs`) |
| Receives inquiries | Receives applications |
| Applies to jobs | Sends inquiries on listings |
| Dashboard: manage inquiries | Dashboard: manage applicants |
| VIP on services | VIP on jobs |
| Public profile by slug | Public profile by hirer ID |

### Key Metrics Tracked
- Service/job views count
- Profile visits (hirer → freelancer analytics)
- Completed jobs count
- Average ratings
- Follower/following counts
- Unread messages/notifications counts

---

## User Types and Roles

Every authenticated user has a row in `profiles` with `user_type`:

| Type | Description | Extended Profile Table |
|------|-------------|----------------------|
| `freelancer` | Offers services, applies to jobs | `freelancer_profiles` |
| `hirer` | Posts jobs, sends inquiries | `hirer_profiles` |

### Freelancer Profile Fields
- `slug` — unique URL identifier (`/freelancer/:slug`)
- `professional_title` — job title/specialty
- `bio` — detailed biography (50-5000 chars)
- `availability` — work availability status
- `languages` — spoken languages array
- `is_profile_complete` — gates public visibility
- `is_public` — controls discoverability
- `is_accepting_new_work` — availability indicator
- `show_completed_work_on_public_profile` — toggle for showing work history
- **Social URLs**: LinkedIn, GitHub, Facebook, Instagram, X (Twitter), TikTok, YouTube
- **Ratings**: `average_rating`, `total_reviews_count`, `completed_jobs_count`

### Hirer Profile Fields
- `company_name` — organization name
- `description` — company description (30-5000 chars)
- `industry` — business sector
- `website_url` — company website
- **Stats**: `jobs_posted_count`, `completed_jobs_count`, `average_rating_given`

### Base Profile Fields (All Users)
- `full_name` — display name (2-120 chars)
- `email` — verified email address
- `avatar_url` — profile picture (Supabase Storage)
- `city` — location
- `phone` — contact number (optional)
- `cv_url` — public CV URL
- `is_active`, `is_online`, `is_verified`
- `member_since` — registration date
- `unread_messages_count`, `unread_notifications_count`

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (React SPA)                         │
│  React 19 + TypeScript + Vite 8 + React Router 7 + Tailwind 4   │
│  + PayPal JS SDK + TanStack Query                               │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ Supabase JS Client              │ PayPal Checkout
                │ (anon/publishable key)          │
                ▼                                 ▼
┌─────────────────────────────────┐     ┌──────────────────────────┐
│       Supabase Backend          │     │   PayPal REST API        │
│  ┌──────────────────────────┐   │     │   (sandbox / production) │
│  │ PostgreSQL + RLS         │   │     └──────────────────────────┘
│  │ • 27+ tables             │   │
│  │ • Row Level Security     │   │
│  │ • RPCs & Triggers        │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ Auth                     │   │
│  │ • Email/password         │   │
│  │ • Email verification     │   │
│  │ • Password reset         │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ Storage                  │   │
│  │ • Avatars bucket         │   │
│  │ • Service images         │   │
│  │ • Job images             │   │
│  │ • Portfolio images       │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ Realtime                 │   │
│  │ • Notifications          │   │
│  │ • Chat messages          │   │
│  │ • Dashboard updates      │   │
│  └──────────────────────────┘   │
│  ┌──────────────────────────┐   │
│  │ Edge Functions (Deno)    │   │
│  │ • 14 serverless funcs    │   │
│  │ • Rate limiting (Redis)  │   │
│  │ • PayPal verification    │   │
│  │ • Email dispatch         │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
                ▲
                │ HTTP/HTTPS
┌───────────────┴─────────────────┐
│  server.mjs (Node HTTP Server)  │
│  • Serves dist/ static files    │
│  • Security headers (CSP, etc.) │
│  • SPA fallback routing         │
│  Deployed on Railway            │
└─────────────────────────────────┘
```

### Why This Architecture?

1. **Supabase as BaaS**: Single platform for auth, database, storage, realtime—reduces operational complexity
2. **PostgreSQL RLS**: Authorization enforced at the database layer, not just frontend
3. **Edge Functions**: Keep secrets (PayPal, service role) server-side with rate limiting
4. **RPC Functions**: Complex queries in Postgres reduce round-trips and improve performance
5. **Static SPA + Node Server**: Fast CDN-friendly assets with consistent security headers

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.5 | UI framework |
| TypeScript | 6.0.2 | Type safety |
| Vite | 8.0.10 | Build tool & dev server |
| React Router | 7.14.2 | Client-side routing |
| Tailwind CSS | 4.2.4 | Utility-first styling |
| TanStack Query | 5.100.14 | Server state management |
| @paypal/react-paypal-js | 9.2.0 | PayPal integration |
| react-helmet-async | 3.0.0 | Document head management |
| DOMPurify | 3.4.8 | XSS sanitization |
| html2pdf.js | 0.14.0 | CV PDF generation |
| browser-image-compression | 2.0.2 | Image optimization |

### Backend (Supabase)
| Component | Purpose |
|-----------|---------|
| PostgreSQL | Primary database with RLS |
| Supabase Auth | User authentication |
| Supabase Storage | File uploads (images) |
| Supabase Realtime | WebSocket subscriptions |
| Edge Functions (Deno) | Serverless API endpoints |
| pg_net | HTTP webhooks from database |

### External Services
| Service | Purpose |
|---------|---------|
| PayPal | Payment processing (VIP subscriptions) |
| Upstash Redis | Rate limiting for Edge Functions |
| Resend / Gmail SMTP | Transactional emails |
| Google Analytics 4 | Usage analytics |

### DevOps & Testing
| Tool | Purpose |
|------|---------|
| Railway | Production hosting |
| Playwright | End-to-end testing |
| k6 | Load testing |
| ESLint | Code linting |
| Gitleaks | Secret scanning (CI) |

---

## Application Routes and Pages

### Public Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Landing page with stats, search, mixed feed |
| `/browse` | Browse | Browse freelancers by category |
| `/listings` | Listings | Service listing marketplace |
| `/listing/:id` | ListingDetail | View service + inquiry form (hirers) |
| `/jobs` | Jobs | Job board with filters |
| `/job/:id` | JobDetail | View job + apply (freelancers) |
| `/freelancer/:slug` | FreelancerProfile | Public freelancer profile |
| `/hirers` | Hirers | Hirer directory |
| `/hirer/:id` | HirerPublic | Public hirer profile |
| `/cv/:slug` | PublicCV | Public CV page |
| `/forum` | Forum | Community discussion board |
| `/forum/:postId` | ForumPostDetail | Individual forum post |
| `/login` | Login | User authentication |
| `/register` | Register | New user registration |
| `/forgot-password` | ForgotPassword | Password recovery initiation |
| `/auth/reset-password` | ResetPassword | Password reset completion |
| `/auth/confirm` | AuthConfirm | Email verification callback |
| `/about` | About | Platform information |
| `/terms` | Terms | Terms of service |
| `/privacy` | Privacy | Privacy policy |
| `/cookies` | Cookies | Cookie policy |
| `/guide` | Guide | User guide |
| `/faq` | Faq | Frequently asked questions |

### Protected Routes (Require Authentication)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | Role-specific workspace |
| `/profile` | Profile | Account settings |
| `/settings` | Profile | Same as /profile |
| `/onboarding` | Onboarding | First-time profile setup wizard |
| `/saved` | Saved | Bookmarked items |
| `/messages` | Messages | Chat inbox |
| `/messages/:conversationId` | Messages | Specific chat thread |
| `/cv-generator` | CVGenerator | Build CV from profile data |
| `/post-job` | PostJob | Create new job (hirers) |
| `/post-job/:jobId` | PostJob | Edit existing job |
| `/listing/new` | ListingForm | Create service listing (freelancers) |
| `/listing/:id/edit` | ListingForm | Edit service listing |
| `/forum/new` | ForumPostForm | Create forum post |
| `/forum/:postId/edit` | ForumPostForm | Edit forum post |

### Development/E2E Routes

| Route | Condition | Description |
|-------|-----------|-------------|
| `/checkout` | DEV or VITE_PAYPAL_E2E_DIAG=1 | PayPal checkout diagnostics |

---

## Core Features and Functionality

### 1. Registration and Onboarding

**Registration Flow:**
1. User visits `/register` and selects role (freelancer or hirer)
2. Enters: full name, email, password, city, optional phone
3. Supabase Auth creates user with metadata (`user_type`, `full_name`, etc.)
4. Database trigger `handle_new_user` creates:
   - `profiles` row
   - `freelancer_profiles` or `hirer_profiles` row (based on user_type)
5. Email verification sent (if enabled in Supabase dashboard)

**Onboarding Flow:**
- Multi-step wizard at `/onboarding` after first login
- **Freelancers**: skills, title, bio, availability, languages, social URLs, avatar, experience, education
- **Hirers**: company name, description, industry, website
- `is_profile_complete` flag gates public visibility

### 2. Service Listings (Freelancers)

**Creating a Listing:**
- Navigate to `/listing/new` or from dashboard
- Required fields: title, description, price, price type
- Optional: delivery days, images (up to multiple)
- Price types: `fixed` | `hourly` | `monthly`
- Images stored in Supabase Storage with public URLs

**Listing Features:**
- View count tracking (`increment_service_views` RPC)
- VIP/featured status with expiration
- Category and skill tagging
- Bilingual support (`title_en`, `description_en`)

**Inquiry Flow:**
1. Hirer views listing at `/listing/:id`
2. Submits inquiry with message and optional proposed budget
3. Creates `service_inquiries` record
4. Freelancer notified (in-app + email)
5. Freelancer accepts/rejects/completes from dashboard

### 3. Job Postings (Hirers)

**Creating a Job:**
- Navigate to `/post-job`
- Fields: title, description, budget (min/max/type), duration, location type, category, skills, vacancies, contact preference
- Contact preferences: `email_only` | `phone_only` | `both`
- Budget types: `fixed` | `hourly` | `monthly`
- Duration types: short-term, long-term, ongoing
- Location types: remote, on-site, hybrid

**Job Features:**
- View count tracking (`increment_job_views` RPC)
- Application deadline support
- VIP/featured placement
- Vacancy count and accepted applicant tracking
- Bilingual support (`title_en`, `description_en`)

**Application Flow:**
1. Freelancer views job at `/job/:id`
2. Submits application with cover note
3. Creates `job_applications` record
4. Hirer notified (in-app + email)
5. Hirer accepts/rejects from dashboard
6. Accepted applications: freelancer gets contact info per `contact_preference`

### 4. Dashboard

Role-specific workspace with tabs:

**Freelancer Dashboard:**
- **My Listings**: Manage service listings
- **Inquiries Received**: Incoming inquiries on listings
- **My Applications**: Applications sent to jobs
- **Profile Stats**: Views, followers, rating

**Hirer Dashboard:**
- **My Jobs**: Manage job postings
- **Applicants**: Review job applications
- **Sent Inquiries**: Inquiries sent on listings
- **Profile Stats**: Jobs posted, completed

### 5. Reviews and Ratings

**Review System:**
- Reviews created after job/inquiry completion
- Multi-dimensional ratings:
  - `rating_overall` (1-5)
  - `rating_quality` (1-5)
  - `rating_communication` (1-5)
  - `rating_timeliness` (1-5)
- Review text (10-2000 chars)
- Review window with expiration (`review_window_ends_at`)

**Rating Aggregation:**
- `update_freelancer_rating` trigger updates `average_rating` on `freelancer_profiles`
- Ratings visible on public profiles

### 6. Search and Discovery

**Home Feed:**
- Mixed feed of freelancer services and hirer jobs
- VIP items prioritized
- Powered by `get_home_feed` RPC/Edge Function

**Search:**
- Category-based filtering
- Location filtering
- Keyword search
- Default behavior: freelancers → jobs, others → listings

**Category System:**
- Hierarchical categories (`parent_id` self-reference)
- Bilingual names (`name_ka`, `name_en`)
- Categories include: Technology, Design, Writing, Marketing, Video, Music, Business, AI, Tutoring, Home Services, Photography, Automotive, Lifestyle, Other

### 7. Social Features

**Follows:**
- Users can follow other users
- Follow counts displayed on dashboard
- `follows` table with `follower_id`, `following_id`

**Saved Items:**
- Bookmark freelancers, hirers, jobs, services
- Accessible at `/saved`
- `user_saved_items` table with `resource_type`, `resource_id`

**Profile Visits:**
- Track when hirers view freelancer profiles
- Analytics for freelancers
- `profile_visits` table
- `count_distinct_hirer_visitors_to_freelancer` RPC

---

## Marketplace Model

### Dual Marketplace Structure

Hira operates two parallel marketplaces:

| Aspect | Freelancer Marketplace | Hirer Marketplace |
|--------|----------------------|-------------------|
| Primary Entity | Service (`services`) | Job (`jobs`) |
| User Action | Hirer sends inquiry | Freelancer applies |
| Owner Dashboard | Manage inquiries | Manage applicants |
| Promotion | VIP on listing | VIP on job |
| Discovery Page | `/listings` | `/jobs` |

### Why Separate Flows?

1. **Different Data Needs**: Jobs need vacancies, deadlines, application counts; Services need delivery times, portfolio context
2. **Role-Specific UX**: Each role gets optimized workflows
3. **Clear RLS Policies**: Separate tables = simpler authorization rules
4. **Search Optimization**: Different search/filter criteria per marketplace

---

## Database Design

### Core Tables (27+)

#### User Tables
| Table | Description |
|-------|-------------|
| `profiles` | Base user data (email, name, avatar, city, phone, user_type) |
| `freelancer_profiles` | Extended freelancer data (slug, bio, ratings, social URLs) |
| `hirer_profiles` | Extended hirer data (company, industry, website) |

#### Marketplace Tables
| Table | Description |
|-------|-------------|
| `services` | Freelancer service listings |
| `jobs` | Hirer job postings |
| `service_inquiries` | Hirer → freelancer interest on listings |
| `job_applications` | Freelancer → hirer applications on jobs |
| `completed_jobs` | Job completion records |
| `reviews` | Post-completion ratings and comments |

#### Taxonomy Tables
| Table | Description |
|-------|-------------|
| `categories` | Service/job categories (hierarchical) |
| `subcategories` | Category specializations |
| `skills` | Available skills |
| `freelancer_skills` | Many-to-many skills with proficiency level |
| `job_skills` | Skills required for jobs |

#### Profile Enrichment
| Table | Description |
|-------|-------------|
| `experience` | Work/project experience entries |
| `freelancer_education` | Education history |
| `portfolio_items` | Portfolio pieces with images |

#### Communication
| Table | Description |
|-------|-------------|
| `conversations` | Chat threads (1:1 between users) |
| `messages` | Individual chat messages |
| `conversation_reads` | Read receipts |
| `notifications` | In-app alerts |

#### Engagement
| Table | Description |
|-------|-------------|
| `follows` | User follow relationships |
| `user_saved_items` | Bookmarked items |
| `profile_visits` | Profile view tracking |

#### Forum
| Table | Description |
|-------|-------------|
| `forum_posts` | Discussion posts |
| `forum_comments` | Post comments |

#### Payments & Admin
| Table | Description |
|-------|-------------|
| `vip_payments` | PayPal payment audit trail |
| `reports` | User-submitted content reports |

### Key RPCs and Functions

| Function | Purpose |
|----------|---------|
| `get_listings_page()` | Paginated services with categories/skills |
| `get_jobs_page()` | Paginated jobs with filters |
| `get_home_feed()` | Mixed homepage feed |
| `get_or_create_conversation()` | Create/retrieve chat threads |
| `get_chat_inbox_message_stats()` | Unread counts for inbox |
| `increment_service_views()` | Track listing views |
| `increment_job_views()` | Track job views |
| `count_distinct_hirer_visitors_to_freelancer()` | Profile analytics |
| `public_job_application_counts()` | Applicant counts for job cards |
| `public_freelancer_completed_service_titles()` | Public work history |
| `get_job_hirer_contact_for_applicant()` | Reveal contact on acceptance |
| `send_status_notification()` | Create notifications |

### Key Triggers

| Trigger | Purpose |
|---------|---------|
| `handle_new_user` | Bootstrap profiles on signup |
| `handle_job_completion` | Job lifecycle side effects |
| `handle_job_posted` | Update hirer stats |
| `update_freelancer_rating` | Recalculate average rating |
| `set_updated_at` | Auto-update timestamps |
| `notify_via_email` | Trigger email on notification insert |

---

## Authentication and Security

### Authentication Flow

1. **Registration**: Rate-limited via `auth-rate-limit` Edge Function
2. **Login**: Proxied through `auth-login` Edge Function with brute-force protection
3. **Email Verification**: Supabase Auth confirms email
4. **Password Reset**: `auth-rate-limit` + Supabase password recovery

### Rate Limiting

- **Login**: 5 attempts per 15 minutes per IP + email
- **Register/Recover**: Controlled via `auth-rate-limit`
- **API Endpoints**: Upstash Redis sliding windows
- **Cooldown**: 15-minute UI cooldown on failures (`AUTH_COOLDOWN_MS`)

### Row Level Security (RLS)

Authorization enforced at the database level:

```sql
-- Users can only read/update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Hirers can only manage their own jobs
CREATE POLICY "Hirers manage own jobs" ON jobs
  FOR ALL USING (hirer_profile_id IN (
    SELECT id FROM hirer_profiles WHERE user_id = auth.uid()
  ));

-- Chat restricted to participants
CREATE POLICY "Chat participants only" ON messages
  FOR SELECT USING (is_conversation_participant(conversation_id));
```

### Security Headers

Implemented in `security/csp.mjs` and applied by all servers:

```
Content-Security-Policy: default-src 'none'; script-src 'self' ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Cross-Origin-Opener-Policy: same-origin-allow-popups
Cross-Origin-Resource-Policy: same-origin
```

### Input Validation

Centralized in `src/lib/validation.ts`:

| Field | Limits |
|-------|--------|
| Email | max 254 chars |
| Password | 8-128 chars, uppercase + digit |
| Full Name | 2-120 chars |
| Bio | 50-5000 chars |
| Job/Listing Title | 3-100/120 chars |
| Job/Listing Description | 100-20,000 chars |
| Chat Message | 1-4000 chars |
| Review Text | 10-2000 chars |
| URL | max 2048 chars |
| Money | max 999,999,999 |

---

## Real-time Features

### Supabase Realtime Subscriptions

1. **Notifications**: Live updates in navbar
2. **Chat Messages**: Real-time message delivery
3. **Chat Read Receipts**: "Sent"/"Read" status
4. **Dashboard Updates**: Inquiry/application status changes

### Implementation

```typescript
// Notification subscription (src/lib/notifications.ts)
supabase
  .channel(`notifications:${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, handleNewNotification)
  .subscribe()

// Chat realtime (src/lib/chatRealtime.ts)
supabase
  .channel(`messages:${conversationId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, handleNewMessage)
  .subscribe()
```

### Broadcast Channels

- `inboxBroadcastHub.ts` — Inbox-wide message updates
- `chatBroadcast.ts` — Per-conversation broadcasts
- `dashboardMessagingRealtime.ts` — Dashboard status changes

---

## Payment System (VIP/Featured Placements)

### VIP Tiers and Pricing

| Tier | Georgian Price (₾) | USD (PayPal) | Duration |
|------|-------------------|--------------|----------|
| Bronze | ₾10 | ~$3.64 | 7 days |
| Silver | ₾20 | ~$7.27 | 14 days |
| Gold | ₾30 | ~$10.91 | 30 days |

**Currency Note**: Customer-facing prices are in Georgian Lari (GEL). PayPal charges in USD due to sandbox/production GEL limitations. Conversion rate: 2.75 GEL/USD.

### VIP Flow

1. User initiates VIP purchase on job or listing
2. PayPal JS SDK creates order in browser
3. User completes PayPal checkout
4. On approval, client calls `activate-vip` Edge Function
5. Edge Function:
   - Validates PayPal order ID with PayPal API
   - Verifies payment amount and currency
   - Checks listing ownership
   - Records payment in `vip_payments`
   - Sets `is_vip = true` and `vip_expires_at` on job/service
6. VIP benefits activated immediately

### VIP Benefits

- **Badge**: VIP indicator on listings/jobs
- **Feed Priority**: Boosted in home feed and search results
- **Homepage Section**: Featured in VIP section
- **Stackable**: Existing VIP extends expiration date

### Payment Verification

```typescript
// activate-vip/index.ts validates:
// 1. Order status is COMPLETED
// 2. Amount matches tier price (±$0.02 tolerance)
// 3. Currency is USD
// 4. User owns the listing
// 5. Order not already used
```

---

## Messaging System

### Conversation Structure

- 1:1 conversations between two users
- Stored with ordered participant IDs: `(participant_low, participant_high)` to prevent duplicates
- Optional context: `job_application_id` OR `service_inquiry_id`

### Features

- **Unread Counts**: Per-conversation and global
- **Read Receipts**: "გაგზავნილია" (Sent) / "წაკითხულია" (Read)
- **Context Links**: Messages tied to specific applications/inquiries
- **Real-time**: WebSocket-based message delivery

### Entry Points

1. `StartConversationButton` on job/listing pages
2. `/messages?with=<userId>&inquiry=<inquiryId>`
3. Notification links

### RLS Protection

- `is_conversation_participant()` helper function
- `get_or_create_conversation` verifies participation before creating

---

## CV Generator

### How It Works

- **No AI Generation**: CVs built from existing profile data
- **Data Sources**: Profile, experience, education, skills
- **Client-Side PDF**: Uses `html2pdf.js` for generation
- **Public URL**: `/cv/:slug` for sharing

### CV Sections

1. Personal Information (from `profiles`)
2. Professional Summary (from `freelancer_profiles.bio`)
3. Skills (from `freelancer_skills`)
4. Work Experience (from `experience`)
5. Education (from `freelancer_education`)
6. Contact Information

### Edge Functions

- `cv-get` — Retrieve CV data
- `cv-update` — Update CV settings
- `cv-generate` — **Disabled (HTTP 410)** — generation is client-side

---

## Forum System

### Forum Structure

**Categories:**
1. **General**: Announcements, Introductions, Off-topic
2. **Work & Jobs**: Job Offers, Job Search, Freelance
3. **Q&A**: Technical, Career
4. **Community**: Events, Resources, Feedback

### Features

- Posts with title and body
- Category and subcategory tagging
- Comments on posts
- Author information (name, avatar)
- Edit/delete own posts
- Timestamps (created, updated)

### Validation

| Field | Limits |
|-------|--------|
| Post Title | 3-200 chars |
| Post Body | 10-20,000 chars |
| Comment | 1-4,000 chars |

---

## Notifications

### Notification Types

- Application received/accepted/rejected
- Inquiry received/accepted/rejected/completed
- Job status changes
- Message received
- Review received
- System announcements

### Delivery Channels

1. **In-App**: Navbar notification bell with unread count
2. **Email**: Optional, via `send-notification-email` Edge Function

### Email Triggering

```sql
-- Database trigger on notification INSERT
CREATE TRIGGER on_notification_created
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_via_email();

-- Uses pg_net for HTTP webhook to Edge Function
```

### Notification Fields

| Field | Description |
|-------|-------------|
| `title` | Short headline (max 200 chars) |
| `body` | Detailed message (max 2000 chars) |
| `link` | Click destination |
| `type` | Notification category |
| `payload` | Additional JSON data |
| `is_read` | Read status |

---

## Analytics

### Google Analytics 4 Integration

**Measurement ID**: `G-HT76VNZHG5`

### Implementation

- Initialized in `src/main.tsx` via `initGoogleAnalytics()`
- **Production Only**: Disabled in development
- **Consent-Gated**: Only runs after full cookie consent
- **SPA-Aware**: Manual page view tracking on route changes

### Tracked Events

```typescript
import { trackEvent } from "../lib/analytics.ts"

// Page views (automatic)
trackPageView(location.pathname + location.search)

// Custom events
trackEvent("sign_up", { method: "email" })
trackEvent("purchase", { value: 49.99, currency: "GEL" })
trackEvent("button_click", { button_name: "post_job" })
```

### CSP Configuration

```
script-src: https://www.googletagmanager.com
connect-src: https://www.google-analytics.com, https://analytics.google.com
```

---

## Internationalization (i18n)

### Language Support

| Language | Code | Status |
|----------|------|--------|
| Georgian | `ka` | Primary (default) |
| English | `en` | Lazy-loaded |

### Implementation

```typescript
// src/i18n/translate.ts
import { t } from "./translate.ts"

// Usage
const label = t("common.submit") // "გაგზავნა" or "Submit"
const formatted = t("validation.fieldTooShort", { label: "Name", min: 2 })
```

### Translation Files

- `src/i18n/translations/ka.ts` — Georgian (bundled)
- `src/i18n/translations/en.ts` — English (lazy-loaded)

### Bilingual Data

Database columns support both languages:
- `categories.name_ka`, `categories.name_en`
- `jobs.title`, `jobs.title_en`, `jobs.description_en`
- `services.title`, `services.title_en`, `services.description_en`

### Cookie Consent Gating

Language preference stored only after cookie consent.

---

## Edge Functions (Serverless)

### Available Functions

| Function | Purpose | Auth | Rate Limited |
|----------|---------|------|--------------|
| `auth-login` | Rate-limited login proxy | No | Yes (IP + email) |
| `auth-rate-limit` | Register/recover attempt counting | No | Yes |
| `get-listings-page` | Cached listings payload | No | Yes (Redis) |
| `get-jobs-page` | Paginated jobs with caching | No | Yes (Redis) |
| `get-home-feed` | Homepage mixed feed | No | Yes (Redis) |
| `get-homepage-vip` | VIP-highlighted items | No | Yes (Redis) |
| `activate-vip` | PayPal order verification + VIP activation | Yes | Yes (user) |
| `paypal-capture` | PayPal capture helper | Yes | Yes |
| `send-notification-email` | Email delivery | Service Role | No |
| `cv-get` | CV slug read | Optional | No |
| `cv-update` | CV slug update | Yes | Yes |
| `cv-generate` | **Disabled (410)** | — | — |
| `sitemap` | Sitemap generation | No | No |
| `health` | Health check | No | No |

### Shared Modules

Location: `supabase/functions/_shared/`

| Module | Purpose |
|--------|---------|
| `cors.ts` | Origin allowlist via `ALLOWED_ORIGINS` |
| `rateLimit.ts` | Upstash Redis sliding windows |
| `validation.ts` | Request parsing and sanitization |

### CORS Configuration

```typescript
// Allowed origins (env: ALLOWED_ORIGINS)
const ALLOWED = [
  "https://hira.up.railway.app",
  "https://hira.ge",
  "https://www.hira.ge",
  "http://localhost:5173"
]
```

---

## Frontend Architecture

### Entry Point

`src/main.tsx`:
- Mounts React app
- Initializes Google Analytics
- Sets up BrowserRouter
- Wraps with QueryClientProvider

### Routing

`src/App.tsx`:
- Defines all routes with `react-router-dom`
- Lazy-loads pages for code splitting
- Protects routes with `ProtectedRoute`
- Handles scroll restoration
- Tracks page views

### State Management

| Layer | Tool |
|-------|------|
| Server State | TanStack Query |
| Auth State | Supabase client |
| UI State | React useState/useEffect |
| Form State | React useState |

### Key Libraries (`src/lib/`)

| Module | Responsibility |
|--------|----------------|
| `supabase.ts` | Supabase client singleton |
| `authRateLimit.ts` | Login/register throttling |
| `validation.ts` | Form validation rules |
| `listingPrice.ts` | Price formatting |
| `marketplaceFilters.ts` | Category/location filters |
| `marketplaceCategoryTree.ts` | Hierarchical category navigation |
| `homeFeed.ts` | Home feed data loading |
| `chat.ts` / `chatRealtime.ts` | Messaging |
| `notifications.ts` | Notification fetch + realtime |
| `savedItems.ts` / `follows.ts` | Engagement features |
| `storageImageUrl.ts` | Supabase Storage URL helpers |
| `vipJobTiers.ts` | VIP pricing helpers |
| `analytics.ts` | GA4 integration |

### Query Pattern

```typescript
// src/lib/queries/fetchProfile.ts
import { useQuery } from "@tanstack/react-query"
import { supabase } from "../supabase.ts"

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId),
  })
}
```

### Component Structure

```
src/components/
├── ui/                    # Generic UI primitives
│   ├── PageLoader.tsx
│   ├── SkeletonCard.tsx
│   ├── EmptyState.tsx
│   ├── ErrorState.tsx
│   ├── ToastProvider.tsx
│   └── ChatIcon.tsx
├── Navbar.tsx             # Main navigation
├── Footer.tsx             # Site footer
├── ProtectedRoute.tsx     # Auth guard
├── CookieBanner.tsx       # GDPR consent
├── VIPUpgrade.tsx         # VIP purchase modal
├── SaveBookmarkButton.tsx # Bookmark toggle
├── StartConversationButton.tsx
├── HomeFeedSection.tsx    # Feed display
├── MarketplaceCatalogToolbar.tsx
├── LocationFilterSelect.tsx
├── SocialProfileLinks.tsx
└── ...
```

### Styling

- **Tailwind CSS 4**: Utility-first approach
- **Brand Colors**:
  - Primary Blue: `#0088FF`
  - Navy: `#1B2B4B`
  - Gold Accent: `#D4A843`
- **Responsive**: Mobile-first patterns

---

## Security Implementation

### Client vs Server Secrets

| Location | Allowed Values |
|----------|---------------|
| `VITE_*` env vars | Supabase URL, anon key, PayPal **client ID** only |
| Edge Function secrets | Service role, PayPal secret, SMTP, Redis, webhooks |

### CSP Directives

```
default-src 'none'
script-src 'self' 'nonce-...' https://*.paypal.com https://www.googletagmanager.com
style-src 'self' https://*.paypal.com
img-src 'self' data: blob: https://*.supabase.co https://*.paypal.com
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.paypal.com https://*.google-analytics.com
frame-src 'self' https://*.paypal.com
object-src 'none'
base-uri 'self'
form-action 'self' https://*.paypal.com
frame-ancestors 'none'
upgrade-insecure-requests
```

### Input Sanitization

```typescript
// src/lib/validation.ts

// Strip HTML-like delimiters, NUL, and control chars
export function sanitizePlainText(raw: string): string {
  return raw
    .replace(/[<>]/g, "")
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
}

// HTML escaping for email templates
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
```

### XSS Protection

- DOMPurify for rendering user HTML
- Input sanitization on all text fields
- CSP blocks inline scripts
- Nonce-based script allowlisting

### CI Security

- `.github/workflows/gitleaks.yml` scans for leaked secrets

---

## File Storage

### Supabase Storage Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `avatars` | Profile pictures | Public read |
| `service-images` | Listing images | Public read |
| `job-images` | Job posting images | Public read |
| `portfolio-images` | Portfolio pieces | Public read |

### Image Handling

```typescript
// Upload with compression
import { compressImageForUpload } from "./compressImageForUpload.ts"
import { supabase } from "./supabase.ts"

const compressed = await compressImageForUpload(file)
const { data, error } = await supabase.storage
  .from("avatars")
  .upload(path, compressed)
```

### URL Generation

```typescript
// src/lib/storageImageUrl.ts
export function getStorageUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
```

---

## Deployment and Operations

### Railway Configuration

`railway.toml`:
```toml
[build]
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
```

### Build Process

1. `tsc -b` — TypeScript compilation
2. `vite build` — Bundle assets to `dist/`
3. `node server.mjs` — Serve static files

### Production Server

`server.mjs`:
- Node.js HTTP server
- Serves `dist/` directory
- SPA fallback (all routes → `index.html`)
- Security headers injection
- Cache control headers
- Gzip compression

### Supabase Deployment

1. SQL migrations via CLI or dashboard
2. Edge Functions: `supabase functions deploy`
3. Secrets: Dashboard or `supabase secrets set`
4. DB settings: `app.edge_function_url`, `app.service_role_key`

### Static Headers

`public/_headers` generated for Netlify/Cloudflare-style hosts:
```
/*
  Content-Security-Policy: ...
  X-Frame-Options: DENY
  ...

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

---

## Development Environment

### Setup

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Configure required variables
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PAYPAL_CLIENT_ID=your-paypal-client-id  # optional

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev
```

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run lint` | ESLint check |
| `npm run preview` | Preview production build |
| `npm run test:e2e` | Playwright tests |
| `npm run test:e2e:ui` | Playwright UI mode |

### Development Features

- Hot Module Replacement (HMR)
- CSP with `'unsafe-eval'` for HMR
- Inline styles allowed for Tailwind
- Source maps for debugging

---

## Testing

### End-to-End Tests

**Framework**: Playwright

**Configuration**: `playwright.config.ts`

```typescript
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
  },
})
```

### PayPal E2E Testing

- `/checkout` route available in dev
- `PayPalCheckoutE2E.tsx` diagnostics page
- Environment variables:
  - `PAYPAL_SANDBOX_BUYER_EMAIL`
  - `PAYPAL_SANDBOX_BUYER_PASSWORD`

### Load Testing

**Framework**: k6

**Script**: `load-test.js`

```bash
k6 run \
  -e SUPABASE_FUNCTIONS_URL="https://xxx.supabase.co/functions/v1" \
  -e SUPABASE_ANON_KEY="your-anon-key" \
  load-test.js
```

---

## Environment Variables

### Client-Side (VITE_*)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/publishable key |
| `VITE_PAYPAL_CLIENT_ID` | No | PayPal client ID (VIP disabled without) |
| `VITE_PAYPAL_E2E_DIAG` | No | Enable /checkout in production |

### Edge Functions (Supabase Secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role (admin) key |
| `PAYPAL_CLIENT_ID` | Yes | PayPal client ID |
| `PAYPAL_SECRET` | Yes | PayPal client secret |
| `PAYPAL_API_BASE` | No | PayPal API URL (default: sandbox) |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis token |
| `RESEND_API_KEY` | No | Resend email API key |
| `RESEND_FROM` | No | Sender email address |
| `GMAIL_SMTP_USER` | No | Gmail SMTP user |
| `GMAIL_SMTP_APP_PASSWORD` | No | Gmail app password |
| `ALLOWED_ORIGINS` | No | CORS allowed origins |
| `EMAIL_WEBHOOK_SECRET` | No | Email trigger auth |

### Database Settings

| Setting | Description |
|---------|-------------|
| `app.edge_function_url` | Base URL for Edge Functions |
| `app.service_role_key` | Service role for pg_net calls |
| `app.email_webhook_secret` | Email trigger authentication |

---

## Project Directory Structure

```
hira/
├── src/
│   ├── App.tsx                 # Routes, layouts
│   ├── main.tsx                # Entry point
│   ├── index.css               # Global styles
│   ├── pages/                  # Route-level screens (34 pages)
│   │   ├── Home.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── Jobs.tsx
│   │   ├── Listings.tsx
│   │   └── ...
│   ├── components/             # Reusable UI components
│   │   ├── ui/                 # Generic primitives
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   └── ...
│   ├── lib/                    # Business logic, helpers
│   │   ├── supabase.ts
│   │   ├── validation.ts
│   │   ├── analytics.ts
│   │   ├── queries/            # TanStack Query fetchers
│   │   └── ...
│   ├── hooks/                  # Custom React hooks
│   ├── i18n/                   # Internationalization
│   │   ├── translate.ts
│   │   └── translations/
│   └── types/                  # TypeScript types
│       └── database.types.ts
├── supabase/
│   ├── migrations/             # PostgreSQL migrations (75+)
│   └── functions/              # Deno Edge Functions (14)
│       ├── _shared/            # Shared utilities
│       ├── auth-login/
│       ├── activate-vip/
│       └── ...
├── security/
│   └── csp.mjs                 # CSP and security headers
├── public/
│   ├── _headers                # Static host headers
│   └── ...                     # Static assets
├── e2e/                        # Playwright tests
├── components/cv/              # CV preview components
├── lib/ai/                     # Legacy AI helper
├── server.mjs                  # Production server
├── load-test.js                # k6 load test
├── vite.config.ts
├── playwright.config.ts
├── railway.toml
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

---

## Design Principles

### 1. Georgian-First Marketplace
- UI, notifications, and categories prioritize Georgian (`ka`) locale
- Architecture supports `name_en` for future English expansion
- Georgian currency display (GEL) with USD backend

### 2. Postgres as Source of Truth
- Ratings, counts, VIP expiry, completion state in database
- Triggers/RPCs maintain consistency
- Not dependent on client-side state

### 3. Thin Frontend, Smart Backend
- List pages use RPCs/Edge Functions
- Avoid N+1 queries
- Redis caching for hot paths (30s TTL)

### 4. Security in Depth
- RLS at database layer
- Edge Functions protect secrets
- CSP headers block XSS
- Auth rate limits prevent brute force
- Gitleaks CI scanning

### 5. Role-Native UX
- Separate dashboards for freelancers and hirers
- Role-specific search defaults
- Contextual action buttons

### 6. Trust and Discovery Loops
- Reviews build reputation
- Completed jobs track history
- Profile visits provide analytics
- Follows create engagement
- VIP promotion increases visibility
- View counts validate interest

### 7. Pragmatic Payments
- PayPal USD backend with GEL display
- Matches regional payment reality
- Doesn't block VIP monetization

---

## Summary

Hira is a comprehensive freelance marketplace platform tailored for the Georgian market. It provides:

- **Two-sided marketplace**: Freelancers offer services; hirers post jobs
- **Complete user journeys**: Registration → Onboarding → Listing/Posting → Applications/Inquiries → Completion → Reviews
- **Real-time communication**: Chat with read receipts and notifications
- **Monetization**: VIP featured placements via PayPal
- **Trust building**: Reviews, ratings, completed work history
- **Discovery**: Categories, search, home feed, bookmarks
- **Security**: RLS, rate limiting, CSP, input validation
- **Modern stack**: React 19, TypeScript, Vite, Supabase, Tailwind

The platform is production-ready with deployment on Railway, comprehensive testing capabilities, and proper separation of concerns between client and server responsibilities.

---

*Documentation generated from codebase analysis. Last updated: July 2026.*
