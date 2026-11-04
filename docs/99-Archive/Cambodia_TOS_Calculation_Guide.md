# Cambodia Tax on Salary (TOS) — Calculation Guide

This document explains how the DCOS payroll engine calculates TOS (Tax on Salary) for Cambodian
employees. It uses Sophat (C-0002, General Manager) as a worked example, and also covers the
non-resident flat-rate case using Anna (C-0013).

All brackets, relief amounts, and exchange rates are stored in the database and configurable
from the **Tax Configuration** screen (`/dashboard/hr/payroll/tax-config`).

---

## Database Tables Involved

| Table | Purpose |
|-------|---------|
| `tos_brackets` | Progressive income tax bands (KHR, rate %) |
| `tos_dependent_relief` | Spouse and child relief amounts (KHR) |
| `tos_flat_rates` | Non-resident / fringe benefit flat rate |
| `tos_exchange_rates` | Monthly USD → KHR conversion rate |
| `employee_tax_profiles` | Per-employee residency, marital status, dependents |
| `employee_salary_structures` | Monthly salary components per employee |

---

## Seeded 2026 Tax Parameters

### TOS Brackets

`to_khr` is inclusive. `tolerance_khr` extends the effective top of a bracket — income within
the tolerance of a boundary is absorbed into the lower bracket as a rounding buffer.

| Band | From (KHR) | To (KHR) | Rate | Tolerance (KHR) | Effective Top |
|------|-----------|---------|------|----------------|--------------|
| 1 | 0 | 1,500,000 | 0% | 0 | 1,500,000 |
| 2 | 1,500,001 | 2,000,000 | 5% | 75,000 | 2,075,000 |
| 3 | 2,000,001 | 8,500,000 | 10% | 175,000 | 8,675,000 |
| 4 | 8,500,001 | 12,500,000 | 15% | 600,000 | 13,100,000 |
| 5 | 12,500,001 | unlimited | 20% | 1,225,000 | ∞ |

> Tolerance values are admin-configurable in the Tax Configuration screen.
> Zero tolerance = strict bracket boundaries (no buffer).

### Dependent Relief

| Type | Amount (KHR/month) |
|------|-------------------|
| Spouse (if dependent) | 150,000 |
| Each child | 150,000 |

### Non-Resident Flat Rate

| Type | Rate |
|------|------|
| Non-resident employee | 20% of gross (no bracket, no relief) |

### Exchange Rate (June 2026)

```
1 USD = 4,000 KHR   ← stored in tos_exchange_rates for period 2026-06
```

---

## Resident Employee Calculation — Step by Step

### Example: Sophat (C-0002), General Manager

**Tax Profile:**

| Field | Value |
|-------|-------|
| Residency | Resident |
| Marital status | Married |
| Spouse dependent | Yes |
| Children | 1 |

**Monthly Salary Components:**

| Component | Amount (USD) | Taxable? |
|-----------|-------------|---------|
| Basic Salary | $3,000 | Yes |
| Housing Allowance | $600 | Yes |
| Transport Allowance | $150 | Yes |
| Meal Allowance | $150 | Yes |
| **Total Gross** | **$3,900** | |

---

### Step 1 — Convert Gross Salary to KHR

Cambodia TOS is calculated entirely in KHR.

```
$3,900 × 4,000 KHR/USD = KHR 15,600,000
```

---

### Step 2 — Subtract Dependent Relief

| Relief Item | Amount (KHR) |
|-------------|-------------|
| Spouse (1 dependent) | 150,000 |
| Child (1 child × 150,000) | 150,000 |
| **Total Relief** | **300,000** |

```
KHR 15,600,000 − KHR 300,000 = KHR 15,300,000   ← taxable income
```

---

### Step 3 — Apply Progressive TOS Brackets (with tolerance)

Each bracket's effective width = `(to_khr + tolerance) − from_khr + 1`.
Income is consumed sequentially from bracket 1 upward.

| Bracket | Effective Range (KHR) | Effective Width | Rate | Income in Band | Tax |
|---------|----------------------|----------------|------|---------------|-----|
| 1 | 0 – 1,500,000 | 1,500,001 | 0% | 1,500,001 | KHR 0 |
| 2 | 1,500,001 – 2,075,000 (+75k tol) | 575,000 | 5% | 575,000 | KHR 28,750 |
| 3 | 2,000,001 – 8,675,000 (+175k tol) | 6,675,000 | 10% | 6,675,000 | KHR 667,500 |
| 4 | 8,500,001 – 13,100,000 (+600k tol) | 4,600,000 | 15% | 4,600,000 | KHR 690,000 |
| 5 | 12,500,001 – ∞ | remaining | 20% | 1,949,999 | KHR 389,999.8 |

```
Total TOS KHR = round(0 + 28,750 + 667,500 + 690,000 + 389,999.8)
              = KHR 1,776,250
```

---

### Step 4 — Convert TOS Back to USD

```
KHR 1,776,250 ÷ 4,000 = $444.06 / month
```

---

### Step 5 — Final Payslip Summary

| Line | Amount |
|------|--------|
| Gross earnings | $3,900.00 |
| − TOS (employee deduction) | −$444.06 |
| − NSSF employee share (2% of basic, capped at $450 base) | −$60.00 |
| **Net Salary** | **≈ $3,395.94** |

**Effective TOS rate:** $444.06 ÷ $3,900 = **11.39%**

> Without tolerances (all zero) and rate 4,000: TOS would be $458.75 (11.76%)
> The configured tolerances save Sophat ~$14.69/month by absorbing boundary income into lower brackets.

---

## Non-Resident Employee — Flat Rate

### Example: Anna (C-0013), Procurement Senior

**Tax Profile:**

| Field | Value |
|-------|-------|
| Residency | Non-resident |
| Marital status | Single |
| Children | 0 |

For non-residents, the progressive bracket table is **ignored entirely**.
The system applies the flat rate from `tos_flat_rates` (20%) to the full KHR gross.
No dependent relief applies.

**Monthly Salary:** Basic $1,100 + Housing $250 + Transport $80 + Meal $80 = **$1,510**

```
Step 1 — Convert to KHR:
  $1,510 × 4,100 = KHR 6,191,000

Step 2 — Apply 20% flat rate:
  KHR 6,191,000 × 20% = KHR 1,238,200

Step 3 — Convert back to USD:
  KHR 1,238,200 ÷ 4,100 = $302.00 / month
```

**Effective TOS rate:** 20% (flat, by law)

---

## Reference: All Staff TOS Snapshots (June 2026)

Approximate TOS at current salary bands and exchange rate 4,100 KHR/USD.

| Emp ID | Name | Gross (USD) | Taxable KHR | Relief KHR | Net Taxable KHR | TOS KHR | TOS USD | Eff. Rate |
|--------|------|-------------|------------|-----------|----------------|---------|---------|-----------|
| C-0001 | Liheng | $5,100 | 20,910,000 | 450,000 | 20,460,000 | 2,842,000 | $693 | 13.6% |
| C-0002 | Sophat | $3,900 | 15,990,000 | 300,000 | 15,690,000 | 1,913,000 | $467 | 11.96% |
| C-0003 | Vuthy | $3,300 | 13,530,000 | 0 | 13,530,000 | 1,531,000 | $373 | 11.3% |
| C-0004 | Chenda | $2,400 | 9,840,000 | 0 | 9,840,000 | 727,000 | $177 | 7.4% |
| C-0005 | Pheara | $1,610 | 6,601,000 | 450,000 | 6,151,000 | 490,100 | $120 | 7.4% |
| C-0013 | Anna | $1,510 | 6,191,000 | — | 6,191,000 | 1,238,200 | $302 | **20% flat** |
| C-0017 | Ratanak | $1,860 | 7,626,000 | 450,000 | 7,176,000 | 592,600 | $145 | 7.8% |
| C-0021 | Kimseng | $2,150 | 8,815,000 | 450,000 | 8,365,000 | 686,500 | $167 | 7.8% |

> Liheng (C-0001): married + spouse + 2 children = 150,000 × 3 = KHR 450,000 relief.
> Vuthy (C-0003): married but no spouse dependent, no children = KHR 0 relief.

---

## Algorithm Summary (for `pit-calculator.ts`)

```typescript
function calculateTOS(
  grossUSD: number,
  exchangeRate: number,          // from tos_exchange_rates
  brackets: TosBracket[],        // from tos_brackets (status = 'active')
  dependentRelief: TosRelief[],  // from tos_dependent_relief
  taxProfile: EmployeeTaxProfile,
  flatRate?: number              // from tos_flat_rates (non_resident)
): { tosKHR: number; tosUSD: number } {

  const grossKHR = grossUSD * exchangeRate;

  // Non-resident: flat rate, no relief
  if (taxProfile.tax_residency === 'non_resident') {
    const tosKHR = grossKHR * (flatRate / 100);
    return { tosKHR, tosUSD: tosKHR / exchangeRate };
  }

  // Resident: compute relief
  let reliefKHR = 0;
  if (taxProfile.spouse_dependent) {
    reliefKHR += dependentRelief.find(r => r.relief_type === 'spouse')?.amount_khr ?? 0;
  }
  reliefKHR += taxProfile.num_children *
    (dependentRelief.find(r => r.relief_type === 'child')?.amount_khr ?? 0);

  const taxableKHR = Math.max(0, grossKHR - reliefKHR);

  // Progressive brackets
  let tosKHR = 0;
  let remaining = taxableKHR;
  for (const bracket of brackets.sort((a, b) => a.from_khr - b.from_khr)) {
    if (remaining <= 0) break;
    const bandTop  = bracket.to_khr ?? Infinity;
    const bandSize = bandTop - bracket.from_khr;
    const taxable  = Math.min(remaining, bandSize);
    tosKHR  += taxable * (bracket.rate_percent / 100);
    remaining -= taxable;
  }

  return { tosKHR, tosUSD: tosKHR / exchangeRate };
}
```

---

*Document generated: 2026-06-02 | Exchange rate: 4,100 KHR/USD | Cambodia TOS Law 2026*
