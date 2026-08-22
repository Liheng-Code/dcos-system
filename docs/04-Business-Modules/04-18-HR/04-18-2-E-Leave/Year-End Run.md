# E-Leave Update — Seniority-Based Annual Leave Entitlement

## 1. New Business Rule

Annual leave entitlement shall be calculated based on employee seniority.

|       Service Year | Annual Leave Entitlement |
| -----------------: | -----------------------: |
|          0–2 years |                  18 days |
|          3–5 years |                  19 days |
|         6–10 years |                  20 days |
| 11 years and above |                  21 days |

---

## 2. Required System Update

The E-Leave module must calculate annual leave entitlement from the employee join date.

```text
Employee Join Date
↓
Calculate Service Year
↓
Check Seniority Policy
↓
Assign Annual Leave Entitlement
↓
Generate New Year Leave Balance
```

---

## 3. Seniority Calculation Rule

Service year shall be calculated from:

```text
Employee Join Date → Year-End Closing Date
```

Example:

| Employee |   Join Date | Year-End Date | Service Year | Entitlement |
| -------- | ----------: | ------------: | -----------: | ----------: |
| A        | 01-Jan-2025 |   31-Dec-2026 |      2 years |     18 days |
| B        | 01-Jan-2023 |   31-Dec-2026 |      4 years |     19 days |
| C        | 01-Jan-2019 |   31-Dec-2026 |      8 years |     20 days |
| D        | 01-Jan-2014 |   31-Dec-2026 |     13 years |     21 days |

---

## 4. Updated Year-End Run Flow

```text
Start Year-End Run
↓
Lock Previous Year Leave Transactions
↓
Calculate Employee Service Year
↓
Apply Seniority Entitlement Rule
↓
Calculate Remaining Leave
↓
Apply Carry Forward Rule
↓
Apply Expiry Rule
↓
Generate New Year Opening Balance
↓
Create Audit Log
↓
Notify Employee
↓
Unlock New Leave Year
```

---

## 5. Example Calculation

### Employee B

| Item                 |       Value |
| -------------------- | ----------: |
| Join Date            | 01-Jan-2023 |
| Closing Date         | 31-Dec-2026 |
| Service Year         |     4 years |
| 2027 Entitlement     |     19 days |
| 2026 Remaining Leave |      6 days |
| Carry Forward Max    |      5 days |

Calculation:

```text
New Year Opening Balance
=
Seniority Entitlement + Carry Forward

=
19 + 5

=
24 days
```

Result:

| Year | Entitlement | Carry Forward | Opening Balance |
| ---: | ----------: | ------------: | --------------: |
| 2027 |          19 |             5 |              24 |

---

## 6. Policy Configuration Screen Update

Add new screen:

```text
HR → E-Leave → Policy Setup → Seniority Entitlement
```

Fields:

| Field             | Example                   |
| ----------------- | ------------------------- |
| Policy Name       | Annual Leave by Seniority |
| Leave Type        | Annual Leave              |
| Effective From    | 01-Jan-2027               |
| Service Year From | 0                         |
| Service Year To   | 2                         |
| Entitlement Days  | 18                        |
| Active            | Yes                       |

---

## 7. Database Update

Add table:

```text
leave_seniority_policy
```

Fields:

| Field             | Type        |
| ----------------- | ----------- |
| id                | UUID        |
| company_id        | UUID        |
| leave_type_id     | UUID        |
| service_year_from | INT         |
| service_year_to   | INT / NULL  |
| entitlement_days  | DECIMAL     |
| effective_from    | DATE        |
| effective_to      | DATE / NULL |
| is_active         | BOOLEAN     |
| created_at        | TIMESTAMP   |
| updated_at        | TIMESTAMP   |

---

## 8. Year-End Run Result Example

| Employee | Service Year | Entitlement | Remaining | Carry Forward | Expired | New Opening |
| -------- | -----------: | ----------: | --------: | ------------: | ------: | ----------: |
| A        |            2 |          18 |         3 |             3 |       0 |          21 |
| B        |            4 |          19 |         6 |             5 |       1 |          24 |
| C        |            8 |          20 |        10 |             5 |       5 |          25 |
| D        |           13 |          21 |         2 |             2 |       0 |          23 |

---

## 9. Audit Log Update

The system must record:

```text
Seniority calculated
Entitlement changed
Carry forward applied
Expired leave calculated
New year balance generated
```

Example audit message:

```text
System calculated annual leave entitlement for Employee B.

Service Year: 4
Policy Applied: 3–5 years
Entitlement: 19 days
Carry Forward: 5 days
Opening Balance 2027: 24 days
```

---

## 10. Employee Notification Example

```text
Dear Employee,

Your annual leave balance for 2027 has been updated.

Service Year: 4 years
Annual Entitlement: 19 days
Carry Forward: 5 days
Expired Leave: 1 day
Opening Balance 2027: 24 days

HR Department
```

---

## 11. Important System Rule

The system must not hard-code seniority rules.

All seniority rules must be configurable by HR/Admin because company policy may change later.

Correct design:

```text
Configurable Policy Table
```

Wrong design:

```text
Hard-coded in source code
```

---

## 12. Final Updated Formula

```text
New Year Opening Balance
=
Seniority-Based Annual Entitlement
+
Approved Carry Forward
-
Expired Leave
```

Or practically:

```text
Opening Balance 2027
=
Annual Entitlement 2027
+
Carry Forward from 2026
```

Expired leave is only recorded for audit and reporting.
