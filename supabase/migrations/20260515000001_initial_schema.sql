-- ============================================================
-- FOLIO Database Schema v1.0
-- ============================================================

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE,
  full_name     TEXT,
  headline      TEXT,
  bio           TEXT,
  avatar_url    TEXT,
  website_url   TEXT,
  location      TEXT,
  is_public     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),
  cover_url     TEXT,
  tech_stack    TEXT[],
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
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  media_type    TEXT NOT NULL
                  CHECK (media_type IN ('image', 'video', 'document')),
  caption       TEXT,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- skills
-- ============================================================
CREATE TABLE IF NOT EXISTS public.skills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT,
  proficiency   TEXT DEFAULT 'intermediate'
                  CHECK (proficiency IN ('beginner', 'intermediate', 'advanced', 'expert')),
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- ============================================================
-- experiences
-- ============================================================
CREATE TABLE IF NOT EXISTS public.experiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company       TEXT NOT NULL,
  role          TEXT NOT NULL,
  description   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE,
  is_current    BOOLEAN DEFAULT FALSE,
  location      TEXT,
  logo_url      TEXT,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- contact_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_messages (
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
-- ============================================================
CREATE TABLE IF NOT EXISTS public.portfolio_views (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug          TEXT,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS ENABLING
-- ============================================================
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_media    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_views  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles
CREATE POLICY "Public profiles are viewable by anyone" ON public.profiles FOR SELECT USING (is_public = TRUE);
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- projects
CREATE POLICY "Published projects on public profiles are viewable" ON public.projects FOR SELECT USING (status = 'published' AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = projects.user_id AND profiles.is_public = TRUE));
CREATE POLICY "Owners can view all own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owners can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- project_media
CREATE POLICY "Media viewable if project is viewable" ON public.project_media FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_media.project_id AND (projects.user_id = auth.uid() OR projects.status = 'published')));
CREATE POLICY "Owners can manage own media" ON public.project_media FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- skills
CREATE POLICY "Skills on public profiles are viewable" ON public.skills FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = skills.user_id AND profiles.is_public = TRUE) OR auth.uid() = user_id);
CREATE POLICY "Owners can manage own skills" ON public.skills FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- experiences
CREATE POLICY "Experiences on public profiles are viewable" ON public.experiences FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = experiences.user_id AND profiles.is_public = TRUE) OR auth.uid() = user_id);
CREATE POLICY "Owners can manage own experiences" ON public.experiences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- contact_messages
CREATE POLICY "Anyone can send a contact message" ON public.contact_messages FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Recipients can read own messages" ON public.contact_messages FOR SELECT USING (auth.uid() = recipient_id);
CREATE POLICY "Recipients can update own messages" ON public.contact_messages FOR UPDATE USING (auth.uid() = recipient_id);

-- portfolio_views
CREATE POLICY "Anyone can insert a portfolio view" ON public.portfolio_views FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Profile owners can read own view counts" ON public.portfolio_views FOR SELECT USING (auth.uid() = profile_id);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- (Note: Storage buckets usually need to be created via dashboard or RPC in free tier)
-- But we can add the policies here.

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_experiences_updated_at BEFORE UPDATE ON public.experiences FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

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

CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
