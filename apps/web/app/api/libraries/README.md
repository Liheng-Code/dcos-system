# Libraries API — `/api/libraries`

This folder contains the Next.js Route Handlers for the **Cost Libraries** module.

## Endpoints

### `GET /api/libraries`
Returns an empty list. Used by the licensing system to confirm the path prefix exists.

### `GET /api/libraries/[sector]`
Returns all cost-library items for the given sector, sorted by name.

**Sectors** (case-insensitive slug, normalised to DB title-case):
| URL slug | DB value |
|---|---|
| `residential` | `Residential` |
| `commercial` | `Commercial` |
| `industrial` | `Industrial` |
| `institutional` | `Institutional` |
| `infrastructure` | `Infrastructure` |
| `prelim` | `Residential` *(placeholder mapping)* |

**Response** `200 OK` — array of library items (camelCase):
```json
[
  {
    "id": "uuid",
    "sector": "Residential",
    "name": "Ready-mix Concrete C25",
    "unit": "m³",
    "currency": "USD",
    "price": 120.50,
    "effectiveDate": "2026-01-01",
    "source": "RS Means 2026",
    "materialType": "Concrete",
    "grade": "C25"
  }
]
```

**Auth** — requires a valid Supabase session cookie (401 if missing).

---

### `POST /api/libraries/[sector]`
Create a new library item in the given sector.

**Body** (JSON):
```json
{
  "name": "Structural Steel S275",
  "unit": "kg",
  "currency": "USD",
  "price": 1.85,
  "materialType": "Steel",
  "grade": "S275"
}
```

**Response** `201 Created` — the created item with its server-assigned `id`.

**Auth / RBAC** — user must be authenticated; RLS enforces `quantity_surveyor` role for writes.

---

### `PUT /api/libraries/[sector]`
Update an existing item. Must include `"id"` in the body.

**Response** `200 OK` — the updated item.

---

### `DELETE /api/libraries/[sector]`
Delete an item by id. Expects `{ "id": "<uuid>" }` in the JSON body.

**Response** `200 OK` — `{ "success": true }`.

---

## Database

Table: `public.cost_libraries`

Migration: `supabase/migrations/202410210001_create_cost_libraries.sql`

Row Level Security:
- **Read** — any authenticated user
- **Write** — authenticated users whose profile has the `quantity_surveyor` role

---

## Front-end integration

Use the `useLibrary(sector)` hook from `@/hooks/useLibrary`:

```tsx
"use client";
import { useLibrary } from "@/hooks/useLibrary";

export default function MyPage() {
  const { items, loading, error, createItem, updateItem, deleteItem } =
    useLibrary("residential");

  // …render items, wire up forms…
}
```

The hook automatically fetches items on mount and provides typed CRUD helpers.

---

## File map

```
apps/web/
├── app/
│   ├── api/libraries/
│   │   ├── route.ts                 ← GET /api/libraries (licensing stub)
│   │   └── [sector]/
│   │       └── route.ts             ← Full CRUD for each sector
│   └── dashboard/libraries/
│       ├── [sector]/page.tsx        ← Dynamic sector page
│       └── residential/page.tsx     ← Legacy static page (kept for compatibility)
├── components/libraries/
│   ├── LibraryList.tsx              ← Table with search, edit, delete buttons
│   ├── LibraryEditor.tsx            ← Create/Edit dialog (react-hook-form + zod)
│   ├── ImportExportModal.tsx        ← JSON import/export dialog
│   ├── SectorNav.tsx                ← Top navigation bar between sectors
│   └── LibraryCard.tsx              ← Summary card used on sector overview pages
├── hooks/
│   └── useLibrary.ts                ← Client data hook (fetch + CRUD)
└── types/
    └── library.ts                   ← Shared TypeScript interfaces
```

