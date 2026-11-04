###### **1. System Architect**               	





&#x09;		DCOS PLATFORM

&#x20;                            │

&#x20;          ┌────────────▼────────────┐

&#x20;          │  DCOS CONTROL PLANE     			│

&#x20;          │                         			│

&#x20;          │  Tenant Registry        			│

&#x20;          │  License Management     			│

&#x20;          │  Subscription Management			│

&#x20;          │  Entitlement Management			│

&#x20;          │  Module Registry        			│

&#x20;          │  Version Management     			│

&#x20;          │  Audit \& Notifications  			│

&#x20;          └────────────┬────────────┘

&#x20;                            │

&#x20;               	Signed License

&#x20;               	/ Entitlements

&#x20;                            │

&#x20;         ┌─────────────┴─────────────┐

&#x20;         │                           			 │

&#x20;   ┌─────▼──────┐              ┌─────▼──────┐

&#x20;   │  TENANT A       │              │  TENANT B  		│

&#x20;   │                 │              │            		│

&#x20;   │ DCOS App        │              │ DCOS App   		│

&#x20;   │ License         │              │ License    		│

&#x20;   │ Validator       │              │ Validator  		│

&#x20;   │ Entitlement     │              │ Entitlement		│

&#x20;   │ Enforcement     │              │ Enforcement		│

&#x20;   └─────┬──────┘               └─────┬──────┘

&#x20;            │                                │

&#x20;   Tenant A DB                 	Tenant B DB



┌─────────────────────────────────────────────────────────────┐

│ DCOS HQ                                      Admin ▼        						 │

├───────────────┬─────────────────────────────────────────────┤

│               	│                                             │

│ Dashboard     │  License Management                         │

│ Tenants       │                                             │

│ Licenses   ←  │  ┌───────────────────────────────────────┐  │

│ Subscriptions │  │ Active      Expiring     Suspended     │  │

│ Modules       │  │   18           3             1         │  │

│ Releases      │  └───────────────────────────────────────┘  │

│ Deployments   │                                             │

│ Support       │  Search tenant...      + Create License     │

│ Audit Logs    │                                             │

│               │  ┌────────────────────────────────────────┐ │

│               │  │ Tenant         Plan      Expiry Status │ │

│               │  │ ABC Corp       Pro       31 Dec 27  🟢 │ │

│               │  │ XYZ Build      Ent.      15 Nov 26  🟡 │ │

│               │  │ DEF Contract   Pro       Expired     🔴 │ │

│               │  └────────────────────────────────────────┘ │

└───────────────┴─────────────────────────────────────────────┘



###### **2. Click Tenant A**



┌─────────────────────────────────────────────────────────────┐

│ ← Licenses / Tenant A                                      │

├─────────────────────────────────────────────────────────────┤

│                                                             │

│ ABC CONSTRUCTION                          🟢 ACTIVE         │

│ License: DCOS-PRO-2027-0001                                │

│                                                             │

│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │

│ │ Plan         │ │ Users        │ │ Expiry               │ │

│ │ Professional │ │ 50 / 50      │ │ 31 Dec 2027          │ │

│ └──────────────┘ └──────────────┘ └──────────────────────┘ │

│                                                             │

│ MODULES                                                     │

│                                                             │

│ ☑ Project          ☑ Planning       ☑ QS                   │

│ ☑ Procurement      ☑ Document       ☐ HSE                  │

│ ☐ QAQC             ☐ Finance       ☐ HR                   │

│                                                             │

│ FEATURES                                                    │

│                                                             │

│ AI Planning       ✓                                        │

│ AI QS             ✓                                        │

│ Advanced Reports  ✓                                        │

│ API Access        ✗                                        │

│                                                             │

│ ─────────────────────────────────────────────────────────── │

│                                                             │

│ \[ Renew License ] \[ Change Plan ] \[ Suspend ] \[ More ▼ ]   │

└─────────────────────────────────────────────────────────────┘



###### **3. Create License screen**



┌─────────────────────────────────────────────┐

│ Create DCOS License                         					│

├─────────────────────────────────────────────┤

│                                             │

│ Tenant                                      │

│ \[ ABC Construction              ▼ ]         │

│                                             │

│ License Type                                │

│ ○ Trial   ● Subscription   ○ Enterprise     │

│                                             │

│ Plan                                        │

│ \[ Professional                  ▼ ]         │

│                                             │

│ Start Date                                  │

│ \[ 01-Jan-2027 ]                             │

│                                             │

│ Duration                                    │

│ \[ 12 Months                     ▼ ]         │

│                                             │

│ USERS                                       │

│ \[ 50 ]                                      │

│                                             │

│ PROJECTS                                    │

│ \[ 20 ]                                      │

│                                             │

│ MODULES                                     │

│ ☑ Project                                   │

│ ☑ Planning                                  │

│ ☑ QS                                        │

│ ☑ Procurement                               │

│ ☑ Document                                  │

│ ☐ HSE                                       │

│ ☐ QAQC                                      │

│                                             │

│             \[ Cancel ] \[ Create License ]   │

└─────────────────────────────────────────────┘

###### **4. Tenant side**



┌─────────────────────────────────────────────────────────────┐

│ Settings → License \& Subscription                           						 │

├─────────────────────────────────────────────────────────────┤

│                                                             │

│ DCOS PROFESSIONAL                                           │

│                                                             │

│ 🟢 ACTIVE                                                   │

│                                                             │

│ Valid until:       31 December 2027                         │

│ Users:             38 / 50                                  │

│ Projects:          7 / 20                                   │

│                                                             │

│ MODULES                                                     │

│                                                             │

│ ✓ Project       ✓ Planning       ✓ QS                       │

│ ✓ Procurement   ✓ Document       ✗ HSE                      │

│                                                             │

│                                                             │

│ Maintenance                                                 │

│ Premium Support                                             │

│ Valid until: 31 December 2027                               │

│                                                             │

│ \[ View Subscription ] \[ Contact DCOS Support ]              │

└─────────────────────────────────────────────────────────────┘

























