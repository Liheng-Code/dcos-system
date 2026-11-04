# 01 – Business Requirement  
**Module:** 04-20-01 Quantity Take-off  
**Version:** 1.0  
**Date:** 2026-10-27

## 1. Purpose
Enable Quantity Surveyors and Estimators to measure construction quantities accurately from 2D drawings and 3D BIM models with full traceability, version control, and linkage to WBS and Cost Codes.

## 2. Business Objectives
- Achieve measurement accuracy ≥ 98% against final account
- Reduce re-measurement effort caused by drawing revisions by ≥ 60%
- Provide a single source of truth for quantities used in Tender, Cost Estimation, Cost Control, and Final Account
- Support both traditional 2D take-off and BIM-based automatic extraction
- Maintain complete audit trail for all measurements

## 3. Scope
### In Scope
- Manual take-off (length, area, volume, count)
- BIM quantity extraction (IFC)
- Factor and formula application
- Cost Code, WBS, and Location assignment
- Revision comparison
- Export and push to other QS modules

### Out of Scope
- Rate application (handled by Cost & Rate Library)
- Pricing and tender submission
- Actual cost recording

## 4. Stakeholders
| Role              | Responsibility                          |
|-------------------|-----------------------------------------|
| Quantity Surveyor | Perform measurements                    |
| Senior QS         | Review and approve sessions             |
| Estimator         | Consume quantities for pricing          |
| Cost Manager      | Use quantities for budget baseline      |
| BIM Coordinator   | Provide models                          |
| Project Manager   | Monitor progress                        |

## 5. Success Metrics
- % of drawings measured on time
- Average variance between take-off and final account
- Number of revision comparisons performed
- User adoption rate among QS team