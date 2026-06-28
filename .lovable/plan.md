## Narimon Ecosystem — Premium Redesign

Rebuild the site to match the attached reference image (dark + emerald glow + glassmorphism + holographic 3D logo) and replace all content with Narimon Ecosystem branding. Keep current hero image (holographic N) and parallax. All routes work; admin-only Dashboard; backend-ready architecture.

### 1. Design system (`src/index.css` + `tailwind.config.ts`)
- Lock semantic tokens (HSL): `--background` near-black, `--primary` emerald `#00E58E`, `--accent` cyan-mint `#1CF7D2`, surface `#0B1015`, border `rgba(0,255,170,0.12)`.
- Add reusable utilities: `.glass-panel`, `.neon-border`, `.emerald-glow`, `.holo-grid-bg`.
- Keyframes: float, pulse-glow, particle-drift, brain-pulse.
- Typography: Space Grotesk (display) + Inter (body).

### 2. Routing & architecture (`src/App.tsx`)
Routes:
- `/` Home (redesigned per spec)
- `/about` and `/biz-haqimizda` → same About page
- `/ai` Narimon AI hub
- `/ai/image`, `/ai/video`, `/ai/text` (reuse existing analysis pages, rebranded)
- `/browser` Narimon Browser
- `/login` (replaces /auth)
- `/pricing`
- `/dashboard` (admin/owner only)
- `/download/:platform` placeholder handler
- `*` 404
Lazy-load page components. Keep TanStack Query, add `RoleProvider` context using existing `useAuth` + new `user_roles` table check.

### 3. Roles (backend)
Migration: `app_role` enum (`guest|user|premium|admin|owner`), `user_roles` table, `has_role()` SECURITY DEFINER function, RLS + GRANTs per platform rules. Hook `useRole()` returns role; `<RoleGate roles={['admin','owner']}>` wrapper for Dashboard nav + route.

### 4. Components (`src/components/`)
Reusable, glassmorphism style:
- `Navbar` — floating glass pill, top spacing, rounded, emerald border, blur. Items: Logo "Narimon Ecosystem", Narimon AI, Narimon Brauzer, Login, Biz haqimizda, NotificationBell, Dashboard (role-gated). Remove Upgrade / floating Ecosystem button / Pricing nav item.
- `NotificationBell` — dropdown with empty state "Bildirishnomalar yo'q"; fetches from `notifications` table (created with RLS) via TanStack Query; ready for realtime.
- `GlassCard`, `FeatureCard`, `DownloadCard`, `AICard`, `PricingCard`, `Timeline`, `Footer`, `Particles`, `HoloOrb`.
- `RequireAuth` and new `RequireRole`.

### 5. Pages

**Home `/`** — keep existing hero composition + holographic N image + mouse parallax + particles.
- Left: H1 "Narimon Ecosystem" (Narimon white, Ecosystem emerald glow), 2-line subtitle, buttons → `/ai` (Narimon AI) and `/browser` (Narimon Brauzer), "Batafsil" link → `/about`.
- Right: existing hero image untouched; parallax preserved.
- Remove StatCards section + bottom two cards.
- Add compact stat strip (1M+ / 99.9% / 24/7) matching reference.

**About `/about`** (alias `/biz-haqimizda`) — Mission, Vision, Goals, ecosystem pillars (AI, Browser, Parental Control, OS, Education, API), Future Roadmap timeline. Glass cards + animated timeline.

**Narimon AI `/ai`** — Title "Narimon AI", center animated holographic brain (CSS/SVG with pulse), left column: Image / Video / Text Analysis cards linking to subroutes; right column: API Key (→ existing API page), AI Chat ("Demo tez orada"), Upgrade Plan (→ `/pricing`).

**Browser `/browser`** — Left: 3D browser illustration (generated image), Right: title + description + feature list (AI Protection, Safe Browsing, Content Analysis, Parental Control, Privacy, Realtime Analysis), Downloads grid (Windows/macOS/Android/iOS) each linking `/download/:platform`, Known Limitations + Roadmap + Changelog sections.

**Login `/login`** — email + password, Remember Me, Forgot Password link, Google OAuth button (wired via supabase). Replaces `/auth`.

**Pricing `/pricing`** — 3-tier glass pricing cards (Free / Pro / Enterprise), placeholder CTAs.

**Download `/download/:platform`** — placeholder "Yuklab olish tez orada" with platform badge.

**Dashboard `/dashboard`** — role-gated; reuses existing `AdminDashboard`.

### 6. Assets
Generate 2 new images:
- Holographic floating glass brain (for `/ai`) — emerald neon, dark bg.
- 3D futuristic browser window illustration (for `/browser`) — emerald neon, same lighting.

### 7. Cleanup
- Remove `GlobalProTip`, Upgrade modal from nav, floating "Narimon Ecosystem" button.
- Keep existing analysis edge functions + extension code untouched.

### 8. Verify
Build passes, all nav links resolve, Dashboard hidden for non-admin (manual check via console).

Total: ~15 new/edited files + 1 migration + 2 generated images.
