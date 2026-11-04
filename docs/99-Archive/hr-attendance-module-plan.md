# HR Attendance Module — Full Implementation Plan

## Context
The DCOS project already has `attendance_records`, `attendance_logs`, and `attendance_adjustments` tables, and a read-only attendance page. What's missing is the **active attendance capture layer**: no way for staff to actually clock in/out, no shift schedule baseline to calculate late/absent against, and no per-method flows (GPS, selfie, QR, web, supervisor).

Agreed approach:
- **GPS + Selfie** → site/field workers (proves location + identity)
- **Web self-service** → office/management staff (simple clock-in from dashboard)
- **Supervisor manual entry** → fallback for all edge cases

---

## Phase 1 — Database Migrations (2 new migration files)

### Migration A: `20260609000070_create_shift_schedule_tables.sql`

```sql
-- Work shift templates
CREATE TABLE public.work_shifts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,                          -- "Day Shift", "Flexible Office"
  shift_type      text NOT NULL CHECK (shift_type IN ('fixed','flexible','rotating')),
  start_time      time,                                   -- NULL for flexible
  end_time        time,                                   -- NULL for flexible
  break_minutes   int DEFAULT 60,
  is_overnight    boolean DEFAULT false,
  grace_minutes   int DEFAULT 15,                        -- late threshold
  work_days       text[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  created_at      timestamptz DEFAULT now()
);

-- Assign shifts to employees (effective-dated)
CREATE TABLE public.employee_shift_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id        uuid NOT NULL REFERENCES public.work_shifts(id),
  effective_from  date NOT NULL,
  effective_to    date,
  assigned_by     uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now()
);

-- Site locations with geofence for GPS validation
CREATE TABLE public.site_locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,                          -- "HQ Office", "Site A Gate"
  address         text,
  lat             decimal(10,7),
  lng             decimal(10,7),
  radius_meters   int DEFAULT 100,
  qr_token        text,                                   -- current rotating token
  qr_expires_at   timestamptz,
  qr_rotation_min int DEFAULT 5,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- Seed default shifts
INSERT INTO public.work_shifts (name, shift_type, start_time, end_time, break_minutes, grace_minutes) VALUES
  ('Office Hours',  'fixed',    '08:00', '17:00', 60, 15),
  ('Site Day Shift','fixed',    '07:00', '16:00', 60, 10),
  ('Flexible',      'flexible',  NULL,    NULL,   60, 30);
```

RLS: Authenticated users can read; HR_Manager/admin can write.

### Migration B: `20260609000071_add_selfie_to_attendance_logs.sql`

```sql
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS selfie_url    text,       -- Supabase Storage path
  ADD COLUMN IF NOT EXISTS gps_accuracy  decimal,    -- meters, from browser API
  ADD COLUMN IF NOT EXISTS site_id       uuid REFERENCES public.site_locations(id),
  ADD COLUMN IF NOT EXISTS is_valid      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invalid_reason text;
```

---

## Phase 2 — API Routes (4 new routes)

### `POST /api/hr/attendance/checkin`
**File:** `apps/web/app/api/hr/attendance/checkin/route.ts`

Logic:
1. Get current user session
2. Accept body: `{ method, lat?, lng?, site_id?, selfie_base64?, qr_token? }`
3. If method = `gps`: validate lat/lng within site radius → reject if outside geofence
4. If method = `qr`: validate `qr_token` matches `site_locations.qr_token` and not expired
5. If method = `web`: accept as-is (no location validation)
6. Upload selfie (if present) to Supabase Storage `attendance-selfies/{date}/{userId}.jpg`
7. Insert into `attendance_logs` (check-in, method, location, selfie_url, site_id)
8. Upsert `attendance_records` for today (set check_in_time, status = Present or Late based on assigned shift)

### `POST /api/hr/attendance/checkout`
**File:** `apps/web/app/api/hr/attendance/checkout/route.ts`

Logic:
1. Find today's open `attendance_logs` record for user (no check_out_time yet)
2. Set check_out_time = now()
3. Update `attendance_records` total_hours, mark complete

### `GET /api/hr/attendance/today`
**File:** `apps/web/app/api/hr/attendance/today/route.ts`

Returns: current user's today record (checked_in, check_in_time, status, method)

### `POST /api/hr/attendance/qr/rotate`
**File:** `apps/web/app/api/hr/attendance/qr/rotate/route.ts`

HR-only. Generates a new UUID token for a site_location, sets expiry = now() + rotation_minutes.

---

## Phase 3 — UI Pages (7 pages)

### 1. Staff Check-in Page (primary interface)
**File:** `apps/web/app/dashboard/hr/attendance/checkin/page.tsx`

Layout:
- Top: today's date + current shift name + scheduled time
- Center: large "Check In" / "Check Out" toggle button (green/red)
- Status indicator: Already checked in (shows time), Not yet checked in
- Method tabs: **Web** | **GPS + Selfie** | **QR Code**

**Web tab:** One-click check-in, no extras.

**GPS + Selfie tab:**
- Camera preview using `getUserMedia`
- Capture photo button
- Auto-fetches browser geolocation
- Shows distance from nearest site (green = within range, red = too far)
- Submit button enabled only when photo captured + location fetched

**QR Code tab:**
- Uses `html5-qrcode` library to scan QR from camera
- On valid scan → auto-submits check-in

### 2. My Attendance Page
**File:** `apps/web/app/dashboard/hr/attendance/my/page.tsx`

- Monthly calendar view (color-coded: green=Present, orange=Late, red=Absent, blue=Leave)
- List below calendar: each day's check-in/out times, method, hours worked
- Summary strip: Present %, Late count, Absent count, Total hours

### 3. Shift Management Page (HR admin)
**File:** `apps/web/app/dashboard/hr/attendance/shifts/page.tsx`

- Table of all `work_shifts`: name, type, hours, grace period
- "New Shift" button → inline form
- "Assign" button per shift → employee multi-select picker with effective date

### 4. Site Locations & QR Manager (HR admin)
**File:** `apps/web/app/dashboard/hr/attendance/sites/page.tsx`

- Table of `site_locations`: name, address, radius, QR status
- Per site: "Show QR Code" → modal with live QR (auto-refreshes every 5 min countdown)
- "Rotate Now" button forces immediate token refresh

### 5. Supervisor Attendance Entry
**File:** `apps/web/app/dashboard/hr/attendance/supervisor/page.tsx`

- Date picker (defaults today)
- Team member list with attendance status
- Per employee: Present / Absent / Leave / Late toggle
- Optional: check-in time override
- Bulk "Mark All Present" button
- Submit to create `attendance_records` + `attendance_logs` (method = `manual`)

### 6. Attendance Reports
**File:** `apps/web/app/dashboard/hr/attendance/reports/page.tsx`

- Date range filter + department filter
- Summary table: employee, present days, absent days, late days, total hours
- Export to CSV button
- Charts: attendance rate by department (bar), late trend over time (line)

### 7. Enhance Existing Dashboard
**File:** `apps/web/app/dashboard/hr/attendance/page.tsx` (modify)

Add to top of existing page:
- "My Status Today" card showing current user's check-in state
- Quick "Check In" button linking to `/dashboard/hr/attendance/checkin`
- Navigation cards: Shift Management | Sites & QR | Supervisor Entry | Reports

---

## Phase 4 — Navigation Update

**File:** `apps/web/app/dashboard/hr/page.tsx`
- Update Attendance card description to reflect new sub-pages

---

## Key Existing Assets to Reuse

| Asset | Location |
|---|---|
| Supabase browser client | `apps/web/lib/supabase/client.ts` |
| `EmployeeProfile` interface | `apps/web/app/dashboard/hr/employees/page.tsx` |
| Toast notifications | Sonner (`toast.success`, `toast.error`) |
| shadcn/ui components | `@/components/ui/*` |
| `cn()` utility | `apps/web/lib/utils.ts` |
| Attendance type seeding | `20260527000035_create_attendance_tables.sql` |

---

## Implementation Order

1. Migration A — shift tables + site_locations
2. Migration B — extend attendance_logs
3. API: `/checkin`, `/checkout`, `/today`, `/qr/rotate`
4. UI: Check-in page (all 3 method tabs)
5. UI: My Attendance calendar
6. UI: Supervisor Entry
7. UI: Shift Management
8. UI: Site & QR Manager
9. UI: Reports
10. Enhance existing attendance dashboard page

---

## Verification

1. **Migrations:** Apply and confirm tables exist with `list_tables`
2. **Web check-in:** Staff clicks Check In → verify row in `attendance_logs` with method = `web`
3. **GPS + Selfie:** Allow location + capture selfie → verify `selfie_url` in Storage + GPS in `attendance_logs`
4. **QR flow:** HR generates QR → staff scans → verify method = `qr` in `attendance_logs`
5. **Supervisor entry:** Supervisor marks team → verify `attendance_records` created with method = `manual`
6. **Late calculation:** Assign "Office Hours" (08:00 start, 15 min grace) → check in at 08:20 → verify status = Late
7. **Reports:** Set date range → verify totals match `attendance_records` table
