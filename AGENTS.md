# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

DCOS (Digital Construction Operating System) is a full-featured construction project management platform built with Next.js and Supabase. It includes work breakdown structure (WBS) management, project tracking, task management, and organizational role/permission controls.

**Tech Stack:**
- **Frontend:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4
- **Components:** shadcn/ui with Lucide icons
- **Forms:** React Hook Form + Zod
- **Auth:** Supabase (JWT-based)
- **Visualization:** Three.js for 3D isometric views
- **Package Manager:** pnpm (monorepo workspace)
- **Notifications:** Sonner
- **Styling:** Tailwind CSS v4 with PostCSS

## Development Commands

### Installation & Setup
```bash
# Install dependencies (run from root)
pnpm install

# Set up environment variables
# Copy .env.local.example to apps/web/.env.local and configure Supabase credentials
```

### Development
```bash
# Start dev server (from root or apps/web)
pnpm dev
# Runs Next.js on http://localhost:3000

# Run single dev server at custom host
cd apps/web && pnpm dev -H 0.0.0.0
```

### Build & Production
```bash
# Build for production
cd apps/web && pnpm build

# Start production server
cd apps/web && pnpm start
```

### Linting
```bash
# Run ESLint across the codebase
cd apps/web && pnpm lint

# ESLint config: apps/web/eslint.config.mjs (includes Next.js and React plugin rules)
```

### Testing
No test runner is currently configured. Tests should be added before major refactoring.

## Project Architecture

### Monorepo Structure
```
dcos-system/
├── apps/
│   ├── web/                 # Next.js frontend application
│   │   ├── app/            # Next.js app directory (file-based routing)
│   │   │   ├── dashboard/  # Main dashboard pages
│   │   │   ├── page.tsx    # Landing page with auth redirect
│   │   │   └── layout.tsx  # Root layout
│   │   ├── components/     # React components (feature-organized)
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities, Supabase client, helpers
│   │   ├── public/         # Static assets
│   │   └── package.json
│   └── api/                # API configuration (holds .env for API keys)
├── packages/               # Shared packages
│   ├── ui/                 # Shared UI components (if any)
│   ├── shared/             # Shared utilities and types
│   └── config/             # Shared configuration
└── docs/                   # Documentation and design files
```

### Key Directories

**apps/web/app/** - Next.js routing (App Router)
- `page.tsx` / `layout.tsx` files define routes
- `/dashboard` - authenticated area with modules for WBS, projects, tasks, etc.
- Uses dynamic routes for features like project/task detail pages

**apps/web/components/** - Feature-organized components
- `dashboard/` - Dashboard-specific components and pages
- `wbs/` - WBS management (tree views, Gantt charts, detail panels)
- `projects/` - Project listing and creation
- `documents/` - Document management
- `tasks/` - Task management
- `settings/` - Organization and user settings
- `stakeholders/` - Stakeholder management
- `ui/` - Base shadcn/ui components (buttons, inputs, cards, etc.)
- `landing/` - Landing page components
- Root level: auth, layout, context providers, utilities

**apps/web/lib/** - Utilities and service layer
- `supabase/` - Supabase client initialization and helpers
- `utils.ts` - General utilities (cn() for class merging, etc.)
- Additional helper functions for API calls and data transformations

**apps/web/hooks/** - Custom React hooks
- `useAuth()` - Authentication and session management
- Other feature-specific hooks

## Key Patterns & Conventions

### Component Structure
- Use **functional components** with React hooks
- Place **server components** at route boundaries; use `"use client"` only where needed for interactivity
- shadcn/ui components are pre-configured and should be imported from `@/components/ui`
- Feature components are organized by domain (dashboard, wbs, projects, etc.)

### State Management
- Local state with `useState`
- Context API (see `project-context.tsx`, `task-alerts-provider.tsx`) for shared state
- No Redux or Zustand—keep state management simple with Context + hooks

### Supabase Integration
- Supabase client initialized in `lib/supabase/client.ts`
- Auth session checked in root `page.tsx` with redirect to `/dashboard`
- Row-level security (RLS) policies enforce authorization in the database
- All auth state flows through Supabase session handling

### Forms
- React Hook Form with Zod validation for schema definition
- Zod schemas define both validation and TypeScript types
- Forms appear as modals or sheets (shadcn Dialog/Sheet)

### Styling
- Tailwind CSS v4 with CSS variables for theming
- Base Nova theme via shadcn configuration
- Use `cn()` utility (from `lib/utils.ts`) to merge class names
- Responsive design: mobile-first with Tailwind breakpoints

### Path Aliases
- `@/*` maps to root of `apps/web` for clean imports
- Import components: `import { Button } from "@/components/ui/button"`
- Import utilities: `import { cn } from "@/lib/utils"`

## Important Notes

### Next.js v16 Breaking Changes
The project uses Next.js 16.2.6, which contains breaking changes from earlier versions. See `AGENTS.md` for warnings. Always check `node_modules/next/dist/docs/` for deprecation notices before making changes to routing or configuration.

### Tailwind CSS v4
Tailwind CSS 4 is used with Lightning CSS (Rust-based compiler for performance). Configuration is minimal—most styling uses utility classes directly.

### Environment Variables
- `apps/web/.env.local` - Local development overrides (never commit)
- Supabase URL and anon key required for auth to work
- API configuration in `apps/api/.env` (not deployed as a separate service in this repo)

### Components to Know
- **WBSTree** - Hierarchical tree view for work breakdown structure
- **TaskAlerts** - Notification system for task updates
- **ProjectContext** - Global project selection context
- **Sidebar** - Main navigation layout
- **Dashboard** - Central hub with modules

## Common Development Tasks

### Adding a New Page
1. Create a folder in `apps/web/app/dashboard/[feature]/` with `page.tsx`
2. Wrap with `"use client"` if it needs client-side interactivity
3. Import components from `@/components/[feature]/`
4. Use `useRouter()` from `next/navigation` for navigation

### Adding a New Component
1. Create `.tsx` file in `apps/web/components/[feature]/`
2. Export as named or default export
3. Use shadcn/ui components from `@/components/ui/`
4. Keep props typed with TypeScript interfaces

### Adding a Form
1. Use React Hook Form + Zod for validation
2. Define Zod schema (`const formSchema = z.object(...)`)
3. Use `useForm()` hook with `zodResolver(formSchema)`
4. Import form components from `shadcn/ui` (Input, Label, Button, etc.)

### Authenticating API Calls
- Use Supabase client from `lib/supabase/client.ts`
- Session automatically includes JWT token
- Row-level security (RLS) policies on Supabase tables handle authorization

### Styling Components
- Use Tailwind utility classes directly
- Use `cn()` to merge conditional classes: `cn("px-4 py-2", isActive && "bg-blue-500")`
- For reusable style patterns, extract as Tailwind @apply in globals.css

## Memory & Context

See MEMORY.md in `.Codex/projects/d--dcos-system/memory/` for:
- Current WBS assessment and critical gaps
- Completed modules and architectural decisions
- Backend model structure (if a backend exists in a separate repo)

## References

- [Next.js 16 Docs](https://nextjs.org/docs)
- [React 19 Docs](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [Supabase Docs](https://supabase.com/docs)
- [Zod Documentation](https://zod.dev)
- [React Hook Form](https://react-hook-form.com)
