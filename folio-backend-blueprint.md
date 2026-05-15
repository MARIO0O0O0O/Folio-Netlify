# FOLIO — Technical Blueprint: Supabase Backend Integration
**Version:** 1.0 | **Environment Target:** Supabase Free Tier + Netlify Static Frontend | **Date:** May 2026

---

## Executive Summary

FOLIO is currently a static frontend deployed on Netlify with no backend persistence. This blueprint defines the complete engineering specification to evolve FOLIO into a fully functional prototype using Supabase as the backend on the free tier. All engineering decisions are deterministic, grounded in industry best practices, and scoped to operate within free-tier constraints (500 MB database, 1 GB file storage, 50,000 MAUs, 5 GB egress/month).

The architecture follows a **frontend-first, RLS-secured, serverless pattern**: the Netlify static site communicates directly with Supabase via the `@supabase/supabase-js` client. There is no custom Node/Express/Django backend. All authorization logic lives in PostgreSQL Row Level Security policies. All business logic that cannot be expressed in SQL runs in Supabase Edge Functions (Deno/TypeScript).

---

## 1. System Architecture

### 1.1 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    USER BROWSER                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │        FOLIO Frontend (Netlify CDN)             │   │
│  │                                                 │   │
│  │  HTML/CSS/JS  ←→  supabase-js client            │   │
│  │                        │                        │   │
│  └────────────────────────│────────────────────────┘   │
│                           │  HTTPS (JWT in headers)     │
└───────────────────────────│─────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │       SUPABASE CLOUD       │
              │                            │
              │  ┌──────────────────────┐  │
              │  │   GoTrue Auth API    │  │  ← /auth/v1
              │  └──────────────────────┘  │
              │  ┌──────────────────────┐  │
              │  │  PostgREST REST API  │  │  ← /rest/v1
              │  └──────────────────────┘  │
              │  ┌──────────────────────┐  │
              │  │  Realtime WebSocket  │  │  ← /realtime/v1
              │  └──────────────────────┘  │
              │  ┌──────────────────────┐  │
              │  │  Storage API (S3)    │  │  ← /storage/v1
              │  └──────────────────────┘  │
              │  ┌──────────────────────┐  │
              │  │  Edge Functions      │  │  ← /functions/v1
              │  └──────────────────────┘  │
              │  ┌──────────────────────┐  │
              │  │  PostgreSQL 15       │  │
              │  │  (500 MB free tier)  │  │
              │  └──────────────────────┘  │
              └────────────────────────────┘
```

### 1.2 Technology Decisions

| Layer | Technology | Rationale |
|---|---|---|
| Frontend Host | Netlify (existing) | Already deployed; native Supabase integration via env vars |
| Database | Supabase PostgreSQL 15 | Relational model fits portfolio/project data; SQL portability |
| Auth | Supabase GoTrue | Built-in JWT issuance, OAuth support, RLS integration |
| API | PostgREST (auto-generated) | Zero-code REST from schema; no custom Express server needed |
| File Storage | Supabase Storage (1 GB) | S3-compatible; sufficient for avatar/resume/media on free tier |
| Custom Logic | Supabase Edge Functions (Deno) | Email triggers, external API calls, webhook handlers |
| Client SDK | `@supabase/supabase-js` v2 | Official client; tree-shakeable; TypeScript-first |
| Migrations | Supabase CLI (`supabase db push`) | Version-controlled SQL migrations; CI/CD compatible |
| Env Management | Netlify Environment Variables | Automatic injection of `SUPABASE_URL` and `SUPABASE_ANON_KEY` |

---

## 2. Free Tier Resource Budget

Before building, allocate the free-tier limits across features to avoid surprises.

| Resource | Free Tier Limit | FOLIO Allocation | Buffer |
|---|---|---|---|
| Database storage | 500 MB | 200 MB (schema + data) | 300 MB reserve |
| File storage | 1 GB | 600 MB (images, PDFs, avatars) | 400 MB reserve |
| Database egress | 5 GB/month | ~2 GB projected | 3 GB reserve |
| Monthly Active Users | 50,000 | < 500 (prototype phase) | 49,500 reserve |
| Edge Function invocations | 500,000/month | < 10,000 (email + webhooks) | 490,000 reserve |
| Projects | 2 | 1 production | 1 for staging |

**Free tier pausing:** Supabase pauses free projects after **7 days of inactivity**. During active development, make at least one API call per week or upgrade to Pro ($25/month) before public launch.

**Critical gap — no automatic backups on free tier.** Implement a manual backup strategy using the Supabase CLI export or GitHub Actions + `pg_dump` on a schedule. This is not optional if FOLIO stores user-generated content.

---

## 3. Database Schema

### 3.1 Design Principles

- **Row-level isolation** via `user_id` foreign keys. All tables with user data include a `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE` column.
- **`auth.users` is the single source of truth for identity.** Never duplicate email/password fields. Extend identity via a `profiles` table that mirrors `auth.users(id)`.
- **UUIDs as primary keys.** Use `gen_random_uuid()` (built into Postgres 13+). No integer sequences — UUIDs are safe to expose in URLs and API responses.
- **`created_at` / `updated_at` on every table.** Use `DEFAULT now()` and a trigger to auto-update `updated_at`.
- **Soft deletes not required at prototype stage.** Use hard deletes with `ON DELETE CASCADE` to keep queries simple. Revisit when auditing is needed.
- **No premature normalization.** FOLIO is a portfolio app. Avoid splitting every attribute into a separate table until query patterns emerge.

### 3.2 Schema SQL

```sql
-- ============================================================
-- FOLIO Database Schema v1.0
-- Run via: supabase db push
-- ============================================================

-- Extension for UUID generation (enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- profiles
-- One-to-one extension of auth.users.
-- Created automatically via trigger on user signup.
-- ============================================================
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE,
  full_name     TEXT,
  headline      TEXT,                  -- e.g. "Full-Stack Engineer"
  bio           TEXT,
  avatar_url    TEXT,                  -- Supabase Storage public URL
  website_url   TEXT,
  location      TEXT,
  is_public     BOOLEAN DEFAULT TRUE,  -- controls public portfolio visibility
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- projects
-- Core entity. Each user owns their projects.
-- ============================================================
CREATE TABLE public.projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL,           -- URL-safe identifier
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),
  cover_url     TEXT,                    -- Supabase Storage URL
  tech_stack    TEXT[],                  -- e.g. ARRAY['React', 'Python', 'Postgres']
  repo_url      TEXT,
  live_url      TEXT,
  featured      BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

-- ============================================================
-- project_media
-- Images, videos, or files attached to a project.
-- ============================================================
CREATE TABLE public.project_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,           -- Supabase Storage path (relative)
  media_type    TEXT NOT NULL            -- 'image' | 'video' | 'document'
                  CHECK (media_type IN ('image', 'video', 'document')),
  caption       TEXT,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- skills
-- User-defined skill tags. Many-to-many with proficiency.
-- ============================================================
CREATE TABLE public.skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT,                    -- e.g. 'Language', 'Framework', 'Tool'
  proficiency   TEXT DEFAULT 'intermediate'
                  CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- ============================================================
-- experiences
-- Work history / job entries on the portfolio.
-- ============================================================
CREATE TABLE public.experiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company       TEXT NOT NULL,
  role          TEXT NOT NULL,
  description   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE,                    -- NULL = current position
  is_current    BOOLEAN DEFAULT FALSE,
  location      TEXT,
  logo_url      TEXT,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- contact_messages
-- Inbound contact form submissions. No reply logic at prototype stage.
-- ============================================================
CREATE TABLE public.contact_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name   TEXT NOT NULL,
  sender_email  TEXT NOT NULL,
  subject       TEXT,
  body          TEXT NOT NULL,
  is_read       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- portfolio_views
-- Anonymous view tracking for public portfolio pages.
-- Lightweight: only records date + slug, no PII.
-- ============================================================
CREATE TABLE public.portfolio_views (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug          TEXT,                    -- which project was viewed (NULL = profile page)
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- Add indexes on all foreign keys and frequently filtered columns.
-- ============================================================
CREATE INDEX idx_projects_user_id       ON public.projects(user_id);
CREATE INDEX idx_projects_status        ON public.projects(status);
CREATE INDEX idx_projects_featured      ON public.projects(featured) WHERE featured = TRUE;
CREATE INDEX idx_project_media_project  ON public.project_media(project_id);
CREATE INDEX idx_skills_user_id         ON public.skills(user_id);
CREATE INDEX idx_experiences_user_id    ON public.experiences(user_id);
CREATE INDEX idx_contact_messages_recip ON public.contact_messages(recipient_id);
CREATE INDEX idx_portfolio_views_profile ON public.portfolio_views(profile_id);
CREATE INDEX idx_portfolio_views_date   ON public.portfolio_views(viewed_at);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- Applied to every table with an updated_at column.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_experiences_updated_at
  BEFORE UPDATE ON public.experiences
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP TRIGGER
-- Fires when a new user is inserted into auth.users.
-- Inserts a blank profile row linked to the new user ID.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 4. Row Level Security (RLS)

RLS is the authorization layer. It is enforced at the database level, not the application layer. Every table must have RLS enabled. A table with RLS enabled and **no policies** denies all access to all users — this is the safe default.

### 4.1 RLS Policies

```sql
-- ============================================================
-- Enable RLS on all tables (REQUIRED before policies take effect)
-- ============================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_media    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_views  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles
-- ============================================================
-- Anyone can view public profiles (for public portfolio pages)
CREATE POLICY "Public profiles are viewable by anyone"
  ON public.profiles FOR SELECT
  USING (is_public = TRUE);

-- Users can view their own profile regardless of is_public
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- projects
-- ============================================================
-- Published projects on public profiles are visible to everyone
CREATE POLICY "Published projects on public profiles are viewable"
  ON public.projects FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = projects.user_id
      AND profiles.is_public = TRUE
    )
  );

-- Owners can see all their own projects (including drafts)
CREATE POLICY "Owners can view all own projects"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

-- Owners can insert their own projects
CREATE POLICY "Owners can insert own projects"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Owners can update their own projects
CREATE POLICY "Owners can update own projects"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Owners can delete their own projects
CREATE POLICY "Owners can delete own projects"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- project_media
-- ============================================================
CREATE POLICY "Media viewable if project is viewable"
  ON public.project_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_media.project_id
      AND (
        projects.user_id = auth.uid()
        OR (projects.status = 'published')
      )
    )
  );

CREATE POLICY "Owners can manage own media"
  ON public.project_media FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- skills
-- ============================================================
CREATE POLICY "Skills on public profiles are viewable"
  ON public.skills FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = skills.user_id
      AND profiles.is_public = TRUE
    )
    OR auth.uid() = user_id
  );

CREATE POLICY "Owners can manage own skills"
  ON public.skills FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- experiences
-- ============================================================
CREATE POLICY "Experiences on public profiles are viewable"
  ON public.experiences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = experiences.user_id
      AND profiles.is_public = TRUE
    )
    OR auth.uid() = user_id
  );

CREATE POLICY "Owners can manage own experiences"
  ON public.experiences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- contact_messages
-- ============================================================
-- Anyone (including unauthenticated visitors) can INSERT a message
CREATE POLICY "Anyone can send a contact message"
  ON public.contact_messages FOR INSERT
  WITH CHECK (TRUE);

-- Only the recipient can read their own messages
CREATE POLICY "Recipients can read own messages"
  ON public.contact_messages FOR SELECT
  USING (auth.uid() = recipient_id);

-- Recipients can update (mark as read)
CREATE POLICY "Recipients can update own messages"
  ON public.contact_messages FOR UPDATE
  USING (auth.uid() = recipient_id);

-- ============================================================
-- portfolio_views
-- ============================================================
-- Anyone can insert a view (anonymous analytics)
CREATE POLICY "Anyone can insert a portfolio view"
  ON public.portfolio_views FOR INSERT
  WITH CHECK (TRUE);

-- Only the profile owner can read their own view analytics
CREATE POLICY "Profile owners can read own view counts"
  ON public.portfolio_views FOR SELECT
  USING (auth.uid() = profile_id);
```

---

## 5. Storage Configuration

Supabase Storage uses S3-compatible buckets with access policies. Define two buckets.

### 5.1 Bucket Definitions

```sql
-- Run in Supabase SQL Editor or via CLI migration

-- Bucket: avatars (public — profile photos must be publicly accessible)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  2097152,   -- 2 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Bucket: project-media (public — portfolio images/docs must be viewable)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-media',
  'project-media',
  TRUE,
  10485760,  -- 10 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'application/pdf']
);
```

### 5.2 Storage RLS Policies

```sql
-- AVATARS bucket
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

-- PROJECT-MEDIA bucket
CREATE POLICY "Project media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-media');

CREATE POLICY "Owners can upload project media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-media'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can delete project media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-media'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );
```

**Storage path convention:** All files are stored as `{user_id}/{filename}`. This is what `storage.foldername(name))[1]` resolves to in the policies above. Example: `avatars/3f8e2a1b-xxxx/profile.webp`.

---

## 6. Authentication Configuration

### 6.1 Auth Settings (Supabase Dashboard)

Configure the following in **Authentication → Providers** and **Authentication → URL Configuration**:

| Setting | Value | Notes |
|---|---|---|
| Site URL | `https://tranquil-dolphin-b5d7b0.netlify.app` | Primary redirect target |
| Redirect URLs (allowlist) | `https://tranquil-dolphin-b5d7b0.netlify.app/**` | Wildcard to allow hash routes |
| Email confirmations | Enabled | Required to prevent fake signups |
| Secure email change | Enabled | Sends confirmation to new AND old email |
| JWT expiry | 3600 seconds (1 hour) | Default; extend to 86400 for better UX |
| Email provider | Supabase built-in (Inbucket) → upgrade to Resend | Free tier uses Inbucket for dev; switch to Resend (free 100 emails/day) for prod |
| OAuth: GitHub | Optional; enable for developer portfolios | Configure in GitHub OAuth Apps |
| OAuth: Google | Optional | Configure in Google Cloud Console |

### 6.2 Client Initialization

```javascript
// lib/supabase.js  — single import shared across the entire frontend

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'

// createClient is safe to call multiple times; it returns a singleton internally
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true    // required for OAuth redirect handling
  }
})
```

**Security rule:** Never expose the `service_role` key in the frontend. It bypasses all RLS. The `anon` key is safe to expose — it is public by design, and RLS policies control what unauthenticated requests can access.

### 6.3 Auth Flow Implementation

```javascript
// Sign up with email/password
async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }  // passed to handle_new_user() trigger
    }
  })
  if (error) throw error
  return data
}

// Sign in
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

// Sign out
async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Listen for auth state changes (call once on app init)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN')  { renderAuthenticatedUI(session.user) }
  if (event === 'SIGNED_OUT') { renderPublicUI() }
  if (event === 'TOKEN_REFRESHED') { /* token auto-refreshed, no action needed */ }
})
```

---

## 7. Frontend Data Access Patterns

These are the canonical JavaScript patterns for every FOLIO data operation. Each pattern uses only the `anon` key and relies on RLS for authorization.

### 7.1 Profiles

```javascript
// Fetch own profile (authenticated)
async function getOwnProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', (await supabase.auth.getUser()).data.user.id)
    .single()
  return { data, error }
}

// Fetch a public profile by username (unauthenticated ok)
async function getPublicProfile(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      *,
      projects ( id, title, slug, description, cover_url, tech_stack, featured, display_order ),
      skills ( * ),
      experiences ( * )
    `)
    .eq('username', username)
    .eq('is_public', true)
    .single()
  return { data, error }
}

// Update profile
async function updateProfile(updates) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  return { data, error }
}
```

### 7.2 Projects

```javascript
// List own projects (all statuses)
async function listOwnProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, project_media(*)')
    .order('display_order', { ascending: true })
  return { data, error }
}

// Create a project
async function createProject(projectData) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const slug = projectData.title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  const { data, error } = await supabase
    .from('projects')
    .insert({ ...projectData, user_id: userId, slug })
    .select()
    .single()
  return { data, error }
}

// Update project status
async function publishProject(projectId) {
  const { data, error } = await supabase
    .from('projects')
    .update({ status: 'published' })
    .eq('id', projectId)
    .select()
    .single()
  return { data, error }
}

// Delete project (cascades to project_media)
async function deleteProject(projectId) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
  return { error }
}
```

### 7.3 File Upload

```javascript
// Upload avatar
async function uploadAvatar(file) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const ext = file.name.split('.').pop()
  const path = `${userId}/avatar.${ext}`

  // Upsert to replace existing avatar
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(path)

  // Save URL to profile
  await updateProfile({ avatar_url: publicUrl })
  return publicUrl
}

// Upload project cover image
async function uploadProjectCover(projectId, file) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const ext = file.name.split('.').pop()
  const path = `${userId}/${projectId}/cover.${ext}`

  const { error } = await supabase.storage
    .from('project-media')
    .upload(path, file, { upsert: true })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from('project-media')
    .getPublicUrl(path)

  return publicUrl
}
```

### 7.4 Contact Form

```javascript
// Submit a contact message (works unauthenticated)
async function sendContactMessage(recipientId, formData) {
  const { data, error } = await supabase
    .from('contact_messages')
    .insert({
      recipient_id: recipientId,
      sender_name: formData.name,
      sender_email: formData.email,
      subject: formData.subject,
      body: formData.message
    })
  return { data, error }
}
```

---

## 8. Edge Functions

Edge Functions run on Deno at the network edge. Use them for logic that cannot run safely in the browser: sending emails, signing webhook payloads, or calling APIs that require secret keys.

### 8.1 Functions to Implement

| Function Name | Trigger | Purpose |
|---|---|---|
| `notify-contact` | HTTP POST (called from contact form) | Sends email to portfolio owner when a contact form is submitted |
| `portfolio-view` | HTTP POST (called on public profile page load) | Records an anonymous view; called server-side to avoid client-side spoofing |

### 8.2 `notify-contact` Edge Function

```typescript
// supabase/functions/notify-contact/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!

interface ContactPayload {
  ownerEmail: string
  senderName: string
  senderEmail: string
  subject: string
  body: string
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  const payload: ContactPayload = await req.json()

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: "FOLIO Notifications <noreply@yourdomain.com>",
      to: payload.ownerEmail,
      subject: `New message from ${payload.senderName}: ${payload.subject}`,
      html: `
        <p><strong>From:</strong> ${payload.senderName} (${payload.senderEmail})</p>
        <p><strong>Subject:</strong> ${payload.subject}</p>
        <hr/>
        <p>${payload.body}</p>
      `
    })
  })

  if (!res.ok) {
    return new Response("Email delivery failed", { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" }
  })
})
```

**Deploy:**
```bash
supabase functions deploy notify-contact
supabase secrets set RESEND_API_KEY=re_xxxxxxx
```

---

## 9. Netlify Integration

### 9.1 Environment Variable Setup

Connect FOLIO's Netlify project to Supabase using the native integration:

1. Netlify Dashboard → **Sites → FOLIO → Integrations → Browse**
2. Install **Supabase** integration
3. Connect your Supabase account (OAuth)
4. Select your FOLIO Supabase project
5. Select framework: **Other** (since FOLIO is a static HTML/JS site)
6. Netlify auto-injects: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

For static HTML/JS without a build step, **hardcode** the public values in `lib/supabase.js`. The `SUPABASE_ANON_KEY` is safe to expose in frontend code — it is a public key protected by RLS. Do NOT expose `SUPABASE_SERVICE_ROLE_KEY` anywhere in the frontend.

### 9.2 `netlify.toml` Configuration

```toml
[build]
  publish = "."       # static site; adjust if using a build folder

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200        # SPA fallback for hash/path-based routing

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Content-Security-Policy = "default-src 'self'; connect-src https://*.supabase.co wss://*.supabase.co; img-src 'self' https://*.supabase.co data: blob:; script-src 'self' 'unsafe-inline' https://esm.sh; style-src 'self' 'unsafe-inline' https://api.fontshare.com;"
```

---

## 10. Project Directory Structure

```
folio/
├── index.html                  # App shell / landing page
├── netlify.toml                # Netlify build + redirect config
├── lib/
│   ├── supabase.js             # Supabase client singleton
│   ├── auth.js                 # signUp, signIn, signOut, onAuthStateChange
│   ├── profiles.js             # getOwnProfile, updateProfile, getPublicProfile
│   ├── projects.js             # CRUD for projects
│   ├── media.js                # File upload helpers (avatar, project media)
│   ├── contact.js              # sendContactMessage
│   └── analytics.js            # recordPortfolioView
├── pages/
│   ├── dashboard.html          # Authenticated: project management
│   ├── profile-editor.html     # Authenticated: edit profile, skills, experience
│   ├── public-portfolio.html   # Public: viewer-facing portfolio page
│   └── messages.html           # Authenticated: inbox for contact messages
├── css/
│   ├── base.css                # Design tokens, reset, typography
│   └── components.css          # Cards, forms, buttons, nav
├── supabase/
│   ├── migrations/
│   │   └── 20260515000001_initial_schema.sql   # Full schema from Section 3
│   └── functions/
│       └── notify-contact/
│           └── index.ts        # Edge Function from Section 8
└── .env.local                  # Local dev only — never commit
```

---

## 11. Local Development Setup

```bash
# 1. Install Supabase CLI
brew install supabase/tap/supabase     # macOS/Linux via Homebrew
# OR: npm install -g supabase          # via npm

# 2. Initialize Supabase in your project root
cd folio/
supabase init

# 3. Start local Supabase stack (Docker required)
supabase start
# Output includes local API URL, anon key, service role key, Studio URL

# 4. Apply migrations to local DB
supabase db push

# 5. Update lib/supabase.js to point at local URLs during development
# SUPABASE_URL = http://localhost:54321
# SUPABASE_ANON_KEY = (from supabase start output)

# 6. Open Supabase Studio (local)
# http://localhost:54323

# 7. Link to remote project for deployment
supabase link --project-ref YOUR_PROJECT_REF

# 8. Push migrations to remote
supabase db push --linked

# 9. Deploy Edge Functions
supabase functions deploy notify-contact
```

---

## 12. Free Tier Operational Safeguards

### 12.1 Prevent Project Pausing

Free Supabase projects pause after 7 consecutive days of zero activity. Implement a lightweight keepalive:

```javascript
// Call this once on app initialization (runs every 5 days)
// Lightweight: just fetches the current user session — 1 round-trip
function keepAlive() {
  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000
  setInterval(async () => {
    await supabase.auth.getSession()
  }, FIVE_DAYS_MS)
}
```

Alternatively, set up a GitHub Actions cron job that pings the Supabase health endpoint once per day.

### 12.2 Manual Backup Strategy (No PITR on Free Tier)

```yaml
# .github/workflows/backup.yml
name: Daily Supabase Backup
on:
  schedule:
    - cron: '0 4 * * *'   # 4 AM UTC daily

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Dump database
        run: |
          pg_dump "${{ secrets.SUPABASE_DB_URL }}" \
            --no-owner \
            --no-acl \
            -f backup_$(date +%Y%m%d).sql

      - name: Upload to GitHub artifact
        uses: actions/upload-artifact@v4
        with:
          name: db-backup-${{ github.run_id }}
          path: backup_*.sql
          retention-days: 30
```

Store `SUPABASE_DB_URL` as a GitHub Actions secret. The format is `postgresql://postgres:[DB_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`.

### 12.3 Storage Size Guard

Add a storage usage check to the admin dashboard. Query the `storage.objects` table for total size:

```javascript
async function getStorageUsageMB() {
  const { data, error } = await supabase
    .rpc('get_storage_usage')  // custom RPC defined below

  return data?.total_mb || 0
}
```

```sql
-- SQL function to calculate storage usage
CREATE OR REPLACE FUNCTION public.get_storage_usage()
RETURNS TABLE (total_mb NUMERIC) AS $$
  SELECT ROUND(SUM(metadata->>'size')::NUMERIC / 1048576, 2) AS total_mb
  FROM storage.objects
  WHERE owner = auth.uid()::TEXT;
$$ LANGUAGE SQL SECURITY DEFINER;
```

---

## 13. Feature Scope — Prototype vs. Production

This blueprint delivers a fully functional **Prototype (v1)**. The table below defines explicit in-scope and out-of-scope decisions.

| Feature | v1 Prototype | v2 Production |
|---|---|---|
| Email/password auth | ✅ | ✅ |
| OAuth (GitHub, Google) | Optional | ✅ |
| Project CRUD | ✅ | ✅ |
| File uploads (images, PDFs) | ✅ | ✅ |
| Public portfolio URL | ✅ | ✅ |
| Contact form (stored in DB) | ✅ | ✅ |
| Contact email notification | ✅ (Edge Function + Resend) | ✅ |
| Portfolio view analytics | ✅ (lightweight) | ✅ + charts |
| Resume PDF upload | ✅ | ✅ |
| Realtime features | ❌ | ✅ (live notifications) |
| Custom domain | ❌ | ✅ |
| Automatic backups | ❌ (manual GitHub Actions) | ✅ (PITR — Pro plan) |
| SSO / Team accounts | ❌ | ✅ |
| CDN / image resizing | ❌ | ✅ (Supabase Image Transforms — Pro) |
| HIPAA / SOC 2 | ❌ | N/A (not applicable for portfolio) |
| Database branching | ❌ | ✅ for schema migrations |

---

## 14. Security Checklist

Before any public access, verify every item:

- [ ] RLS enabled on **all** tables — verify in Supabase Dashboard → Table Editor → each table shows "RLS enabled"
- [ ] No `service_role` key in any frontend file or public GitHub repo
- [ ] `anon` key only in frontend; protected by RLS policies
- [ ] Email confirmation enabled in Auth settings
- [ ] CSP header in `netlify.toml` restricts `connect-src` to `*.supabase.co` only
- [ ] Storage bucket policies restrict uploads to `{user_id}/` prefix only
- [ ] Edge Functions secrets stored as Supabase secrets (never hardcoded in function source)
- [ ] No raw SQL user input ever concatenated into RPC calls — use parameterized queries via the JS client at all times
- [ ] `profiles.is_public = FALSE` is the default for new users until they explicitly publish their portfolio
- [ ] `contact_messages` INSERT policy allows unauthenticated inserts — verify spam is mitigated via rate limiting (Netlify Functions rate limiter or a simple CAPTCHA)

