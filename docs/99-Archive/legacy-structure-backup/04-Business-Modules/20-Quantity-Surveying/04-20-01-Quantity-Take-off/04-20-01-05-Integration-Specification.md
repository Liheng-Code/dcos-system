# 05 – Integration Specification  
**Module:** 04-20-01 Quantity Take-off

## Inbound Integrations
| Source Module          | Data Received              | Method     | Frequency |
|------------------------|----------------------------|------------|-----------|
| Document Control       | Drawings + Revisions       | API / Event| Real-time |
| BIM Coordination       | IFC Models                 | API        | On demand |
| WBS Management         | WBS Structure              | API        | Daily     |
| Master Data            | Cost Codes, Locations      | API        | Daily     |

## Outbound Integrations
| Target Module          | Data Sent                  | Method     | Trigger   |
|------------------------|----------------------------|------------|-----------|
| Tender & Estimate      | Firm Quantities            | API        | Manual    |
| Cost Estimation        | Firm Quantities            | API        | Manual    |
| Cost Control           | Baseline Quantities        | API        | Manual    |
| Reporting Engine       | Summary Data               | Event      | On complete |