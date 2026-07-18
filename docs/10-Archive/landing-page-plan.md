# Landing Page Implementation Plan

## Overview

Two-panel split landing page:
- **Left (60%)** — Visual hero with construction project carousel, isometric 3D animation, system title
- **Right (40%)** — Authentication card (Sign In default, Sign Up toggle)

---

## Route & Auth Logic

- `app/page.tsx` — root route
- On mount, check Supabase session
- If authenticated → `router.push('/dashboard')`
- If not → render landing page

---

## Left Panel — Visual Hero

### Background Carousel
- Crossfading full-bleed images of famous construction projects (8 images, 6s interval)
- Dark gradient overlay (black → transparent, 60% opacity at bottom)
- Preloaded via `next/image` or inline `<img>` with `loading="eager"`

### Isometric 3D Scene (`@react-three/fiber` + `@react-three/drei`)
- Buildings rising from ground plane (animated scale Y 0 → 1)
- Rotating construction crane
- Floating blueprint lines + grid
- Slow auto-rotation + mouse parallax
- Fallback: static SVG isometric illustration when WebGL unavailable

### Overlay Content (absolute positioned over carousel + 3D scene)
- Logo / system name: "DC/OS System" (text-4xl bold white)
- Tagline: "Next-Generation Construction Project Intelligence" (text-lg white/80)
- 3 feature bullets with Lucide icons:
  - Real-time Collaboration
  - AI-Powered Insights
  - Global Compliance

---

## Right Panel — Authentication

### Layout
- Centered white card on `--color-muted` background
- Full height, vertically and horizontally centered

### Auth Toggle
- Two tabs: "Sign In" | "Sign Up"
- Active tab: primary-500 underline + text
- Inactive: muted foreground

### Sign In Mode (default)
| Field | Component | Validation |
|---|---|---|
| Email | shadcn Input | zod email |
| Password | PasswordInput (eye toggle) | zod min(8) |
| Remember me | shadcn Checkbox | — |
| Submit | Button "Sign In" | — |
| Forgot Password | Link below button | — |

### Sign Up Mode
| Field | Component | Validation |
|---|---|---|
| Full Name | shadcn Input | zod min(2) |
| Email | shadcn Input | zod email |
| Password | PasswordInput (eye toggle) | zod min(8) |
| Confirm Password | PasswordInput (eye toggle) | zod must match |
| Remember me | shadcn Checkbox | — |
| Submit | Button "Create Account" | — |

### Auth Flow
1. `supabase.auth.signInWithPassword({ email, password })` or `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
2. On success → `router.push('/dashboard')`
3. On error → toast notification + inline field errors

### PasswordInput Component
- Wraps shadcn Input
- Lucide `Eye`/`EyeOff` icon button inside input (absolute positioned, right-aligned)
- Toggles `type="password"` / `type="text"`

---

## Component Tree

```
<LandingPage>                              // app/page.tsx
  <LeftPanel>                              // left 60%
    <ProjectCarousel />                    // background images
    <GradientOverlay />                    // dark gradient
    <IsometricScene />                     // Three.js canvas
    <Content>
      <Logo />                             // "DC/OS System"
      <Tagline />                          // subtitle
      <FeatureList />                      // 3 bullets
    </Content>
  </LeftPanel>
  <RightPanel>                             // right 40%
    <AuthCard>
      <AuthToggle />                       // Sign In | Sign Up
      <AuthForm mode="signin"|"signup">    // react-hook-form + zod
        <FormField />                      // each input
        <PasswordInput />                  // with eye toggle
        <Checkbox />                       // remember me
        <Button />                         // submit
      </AuthForm>
      <FooterLinks />                      // forgot password, switch mode
    </AuthCard>
  </RightPanel>
</LandingPage>
```

---

## Files to Create

| # | File | Purpose |
|---|---|---|
| 1 | `supabase/migrations/20260526_0001_create_profiles.sql` | profiles table + auto-create trigger |
| 2 | `app/globals.css` | Tailwind v4 + design tokens |
| 3 | `app/layout.tsx` | Root layout with Inter font |
| 4 | `app/page.tsx` | Landing page (auth check + split layout) |
| 5 | `lib/supabase/client.ts` | Supabase browser client |
| 6 | `lib/utils.ts` | cn() utility |
| 7 | `hooks/use-supabase-auth.ts` | signIn, signUp, signOut hooks |
| 8 | `components/landing/left-panel.tsx` | Left panel container |
| 9 | `components/landing/right-panel.tsx` | Right panel container |
| 10 | `components/landing/project-carousel.tsx` | Image carousel |
| 11 | `components/landing/isometric-scene.tsx` | Three.js scene |
| 12 | `components/landing/auth-form.tsx` | Sign in / Sign up form |
| 13 | `components/landing/password-input.tsx` | Input with eye toggle |
| 14 | `components/landing/auth-toggle.tsx` | Tab switcher |
| 15 | `components/ui/*` | shadcn components (button, input, label, checkbox, card) |

---

## Component State Matrix

| Component | Loading | Success | Error | Empty | Edge Case |
|---|---|---|---|---|---|
| ProjectCarousel | Skeleton placeholder | Crossfading images | Fallback static gradient | N/A (always has images) | Image load fail → skip and cycle |
| IsometricScene | Spinner overlay | 3D rendering | Hide canvas → show SVG fallback | N/A | WebGL unavailable → static SVG |
| AuthForm | Button spinner, disabled fields | Redirect to /dashboard | Inline errors + toast | Clean slate on toggle switch | Existing email → toast error |
| PasswordInput | Normal input | Normal | Red border + error text | N/A | Toggle shows/hides |
| AuthToggle | Normal | Active tab underlined | N/A | N/A | Stays on invalid toggle |
| LandingPage | Session check spinner | Render landing or redirect | N/A | N/A | Already authed → skip render |

---

## Supabase Migration

```sql
-- supabase/migrations/20260526_0001_create_profiles.sql

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null,
  role        text not null default 'viewer'
    check (role in ('admin', 'project_manager', 'contractor', 'inspector', 'viewer')),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## Edge Cases

| Case | Handling |
|---|---|
| Already authenticated | `page.tsx` checks session → immediate redirect to /dashboard |
| Sign Up with existing email | Supabase returns error → toast "An account with this email already exists" |
| Wrong password on Sign In | Toast "Invalid email or password" |
| Network failure | Toast "Unable to connect. Check your internet connection." |
| Password < 8 chars | Inline: "Password must be at least 8 characters" |
| Passwords don't match | Inline: "Passwords must match" |
| Empty required fields | react-hook-form prevents submit, shows "Required" |
| WebGL unsupported | IsometricScene → hide canvas, show static SVG isometric |
| Carousel image 404 | Skip failed image, continue cycling remaining |
| Mobile (< 768px) | Left panel = hero section above full-width auth form |
| Session expires mid-form | Supabase handles token refresh automatically |
