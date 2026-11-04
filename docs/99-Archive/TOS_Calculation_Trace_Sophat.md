# TOS Calculation Trace — Sophat (C-0002), June 2026

Detailed step-by-step trace of why Run Payroll shows **TOS = $444.06** for Sophat.

---

## Employee Profile

| Field | Value |
|-------|-------|
| Employee ID | C-0002 |
| Name | Sophat |
| Job Title | General Manager |
| Level | L2 |
| Tax Residency | Resident |
| Marital Status | Married |
| Spouse Dependent | Yes |
| Children | 1 |

---

## Salary Components (active, effective 2026-01-01)

| Component | Amount | Taxable? |
|-----------|--------|---------|
| Basic Salary | $3,000.00 | Yes |
| Housing Allowance | $600.00 | Yes |
| Transport Allowance | $150.00 | Yes |
| Meal Allowance | $150.00 | Yes |
| **Total Gross** | **$3,900.00** | |

> All earning components are included in TOS base.
> System components (NSSF_EE, PIT, OT) are calculated — not included in gross.

---

## Active Tax Parameters (from database)

### Exchange Rate — `tos_exchange_rates`

| Period | Rate (KHR/USD) |
|--------|---------------|
| June 2026 | **4,000** |

### TOS Brackets — `tos_brackets` (status = active)

| # | from_khr | to_khr | rate_percent | tolerance_khr | Effective Top |
|---|---------|--------|-------------|--------------|--------------|
| 1 | 0 | 1,500,000 | 0% | 0 | 1,500,000 |
| 2 | 1,500,001 | 2,000,000 | 5% | **75,000** | **2,075,000** |
| 3 | 2,000,001 | 8,500,000 | 10% | **175,000** | **8,675,000** |
| 4 | 8,500,001 | 12,500,000 | 15% | **600,000** | **13,100,000** |
| 5 | 12,500,001 | NULL (∞) | 20% | 1,225,000 | ∞ |

> `tolerance_khr` extends each bracket's top end. Income within the tolerance zone
> of a boundary is absorbed into the lower bracket instead of jumping to the higher rate.

### Dependent Relief — `tos_dependent_relief` (status = active)

| Type | Amount (KHR/month) |
|------|-------------------|
| Spouse | 150,000 |
| Child | 150,000 |

---

## Calculation Trace

### Step 1 — Convert Gross to KHR

```
gross_USD        = $3,900.00
exchange_rate    = 4,000 KHR/USD
gross_KHR        = 3,900 × 4,000 = 15,600,000 KHR
```

### Step 2 — Compute Dependent Relief

```
spouse_relief    = 150,000   (married AND spouse_dependent = true)
child_relief     = 1 × 150,000 = 150,000
total_relief_KHR = 300,000 KHR
```

### Step 3 — Taxable Income

```
taxable_KHR = 15,600,000 − 300,000 = 15,300,000 KHR
remaining   = 15,300,000   ← bucket to consume across brackets
```

### Step 4 — Progressive Bracket Application

The calculator (`calculateTOS_KHR`) fills brackets sequentially from the bottom.
Each bracket's effective width = `(to_khr + tolerance_khr) − from_khr + 1`.

```
─── Bracket 1 (0%) ─────────────────────────────────────────────
  effective_top  = 1,500,000 + 0          = 1,500,000
  band_width     = 1,500,000 − 0 + 1      = 1,500,001
  overlap        = min(15,300,000, 1,500,001) = 1,500,001
  tax            += 1,500,001 × 0.00      = 0
  remaining      = 15,300,000 − 1,500,001 = 13,799,999

─── Bracket 2 (5%) ─────────────────────────────────────────────
  effective_top  = 2,000,000 + 75,000     = 2,075,000
  band_width     = 2,075,000 − 1,500,001 + 1 = 575,000
  overlap        = min(13,799,999, 575,000)   = 575,000
  tax            += 575,000 × 0.05        = 28,750
  remaining      = 13,799,999 − 575,000   = 13,224,999

─── Bracket 3 (10%) ────────────────────────────────────────────
  effective_top  = 8,500,000 + 175,000    = 8,675,000
  band_width     = 8,675,000 − 2,000,001 + 1 = 6,675,000
  overlap        = min(13,224,999, 6,675,000) = 6,675,000
  tax            += 6,675,000 × 0.10      = 667,500
  remaining      = 13,224,999 − 6,675,000 = 6,549,999

─── Bracket 4 (15%) ────────────────────────────────────────────
  effective_top  = 12,500,000 + 600,000   = 13,100,000
  band_width     = 13,100,000 − 8,500,001 + 1 = 4,600,000
  overlap        = min(6,549,999, 4,600,000)  = 4,600,000
  tax            += 4,600,000 × 0.15      = 690,000
  remaining      = 6,549,999 − 4,600,000  = 1,949,999

─── Bracket 5 (20%) ────────────────────────────────────────────
  effective_top  = ∞  (to_khr is NULL)
  band_width     = remaining              = 1,949,999
  overlap        = 1,949,999
  tax            += 1,949,999 × 0.20      = 389,999.80
  remaining      = 0
```

### Step 5 — Sum and Round

```
total_tax_KHR (raw)   = 0 + 28,750 + 667,500 + 690,000 + 389,999.80
                      = 1,776,249.80
total_tax_KHR (round) = Math.round(1,776,249.80) = 1,776,250 KHR
```

### Step 6 — Convert to USD

```
TOS_USD = Math.round((1,776,250 ÷ 4,000) × 100) / 100
        = Math.round(444.0625 × 100) / 100
        = Math.round(44406.25) / 100
        = 44406 / 100
        = $444.06
```

---

## Final Payslip for Sophat

| Line | KHR | USD |
|------|-----|-----|
| Gross Earnings | 15,600,000 | $3,900.00 |
| Dependent Relief | −300,000 | −$75.00 |
| Taxable Income | 15,300,000 | $3,825.00 |
| TOS Deduction | −1,776,250 | **−$444.06** |
| NSSF Employee (2% × min($3,000, $450) cap) | — | −$60.00 |
| **Net Salary** | | **$3,395.94** |

**Effective TOS rate:** $444.06 ÷ $3,900 = **11.39%**

---

## Why This Differs from the Documentation Example ($466.59)

The guide doc (`Cambodia_TOS_Calculation_Guide.md`) was originally written with assumed values.
The live system uses the actual DB state:

| Factor | Doc assumed | Live DB | Impact |
|--------|------------|---------|--------|
| Exchange rate | 4,100 KHR/USD | **4,000 KHR/USD** | Lower KHR base → lower tax |
| Bracket 2 tolerance | 0 KHR | **75,000 KHR** | 75k more at 5% instead of higher |
| Bracket 3 tolerance | 0 KHR | **175,000 KHR** | 175k more at 10% instead of higher |
| Bracket 4 tolerance | 0 KHR | **600,000 KHR** | 600k more at 15% instead of 20% |

Total tolerance effect: **850,000 KHR** shifted from higher brackets to lower → saves
`850,000 × ~7.5% avg rate diff ÷ 4,000 ≈ $15.94` in TOS per month.

---

## Sensitivity Table — Same Employee, Different Inputs

| Exchange Rate | Tolerance | TOS (KHR) | TOS (USD) |
|--------------|-----------|-----------|-----------|
| 4,000 | All zero | 1,835,000 | $458.75 |
| 4,000 | Live (75k/175k/600k) | 1,776,250 | **$444.06** ← actual |
| 4,100 | All zero | 1,913,000 | $466.59 |
| 4,100 | Live (75k/175k/600k) | 1,855,250 | $452.50 |

---

## Code Path

```
run/page.tsx  →  calculate()
  periodExchangeRate  = tos_exchange_rates[year=2026, month=6].rate_khr_per_usd  → 4,000
  spouseRelief  = tosRelief.spouse   (150,000 KHR, married + spouse_dependent)
  childRelief   = 1 × tosRelief.child  (150,000 KHR)
  relief        = { spouse: 150000, children: 150000 }
  tos           = calculateTOS_USD(3900, 4000, tosBrackets, relief)
                  → calculateTOS_KHR(15600000, brackets, relief)
                  → 1,776,250 KHR
                  → $444.06

pit-calculator.ts → calculateTOS_USD() → calculateTOS_KHR()
```

---

*Generated: 2026-06-02 | Period: June 2026 | Exchange rate: 4,000 KHR/USD*
