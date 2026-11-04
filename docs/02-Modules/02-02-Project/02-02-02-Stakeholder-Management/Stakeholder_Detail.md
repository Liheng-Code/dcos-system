#### **1. What “Stakeholder Setup” REALLY means in DCOS**



&#x09;It’s the power map of your project:

&#x09;Who owns decisions

&#x09;Who executes work

&#x09;Who approves

&#x09;Who gets informed



#### **2. Stakeholder Structure (Hierarchy)**



&#x09;Company (Tenant)

&#x09;└── Project

&#x20;   	├── Internal Stakeholders

&#x20;   	│   ├── Director / CEO

&#x20;   	│   ├── Project Manager

&#x20;   	│   ├── Discipline Leads (STR / ARC / MEP)

&#x20;   	│   ├── Engineers / Supervisors

&#x20;   	│   └── Admin / Support (QS / Procurement / HR / QA/QC)

&#x20;   	│

&#x20;   	└── External Stakeholders

&#x20;           ├── Client / Owner

&#x20;           ├── Consultant

&#x20;           ├── Subcontractor

&#x20;           ├── Supplier

&#x20;           ├── Authority

&#x20;           └── Testing / Inspection Agency

&#x09;👉 Every one of these must be registered and linked to project

&#x09;👉 Not optional—this is your control backbone



#### **3. Stakeholder Data Setup (what you must capture)**



&#x09;| Field              | Purpose                                |

&#x09;| ------------------ | -------------------------------------- |

&#x09;| stakeholder\_type   | Define role (Client, Contractor, etc.) |

&#x09;| organization\_name  | Company name                           |

&#x09;| contact\_person     | Real human (critical)                  |

&#x09;| project\_role       | Their responsibility                   |

&#x09;| approval\_level     | View / Review / Approve                |

&#x09;| communication\_mode | Email / Telegram / System              |

&#x09;| status             | Active / Inactive / Blacklist          |



#### **4. Stakeholder Assignment to Project (Core Flow)**



&#x09;1. Create Project

&#x09;2. Add Stakeholders (global register)

&#x09;3. Link Stakeholders to Project

&#x09;4. Assign Role in Project

&#x09;5. Assign Permission Level

&#x09;6. Assign Approval Authority

&#x09;7. Assign WBS Responsibility (optional but powerful)

&#x09;8. Activate Stakeholder



&#x09;💡 Example (Real Project)

&#x09;	| Stakeholder   | Role          | Authority          |

&#x09;	| ------------- | ------------- | ------------------ |

&#x09;	| Client        | Owner         | Final Approval     |

&#x09;	| Consultant    | Reviewer      | Approve drawings   |

&#x09;	| PM            | Internal Lead | Full control       |

&#x09;	| STR Lead      | Discipline    | Approve structural |

&#x09;	| Site Engineer | Execution     | Update tasks       |

&#x09;	| Supplier      | External      | Deliver material   |



#### **5. Stakeholder → Role → Permission Logic**

&#x09;🔐 Example

&#x09;	| Role            | Can Do                    |

&#x09;	| --------------- | ------------------------- |

&#x09;	| Engineer        | Create / Update task      |

&#x09;	| Discipline Lead | Review / Approve          |

&#x09;	| PM              | Full project control      |

&#x09;	| Client          | Approve only              |

&#x09;	| Supplier        | View + limited submission |



&#x09;Stakeholders don’t just sit there—they move through workflows.

&#x09;🧩 A. Task Flow

&#x09;	PM creates task

&#x09;	→ Assign to Engineer

&#x09;	→ Engineer executes

&#x09;	→ Submit to Supervisor

&#x09;	→ Supervisor approves

&#x09;	→ Task closed

&#x09;	👉 Each step = different stakeholder

&#x09;🧩 B. Document Flow

&#x09;	Engineer uploads drawing

&#x09;	→ Discipline Lead reviews

&#x09;	→ Consultant approves

&#x09;	→ Document issued

&#x09;	👉 Stakeholder chain controls quality

&#x09;🧩 C. Procurement Flow

&#x09;	Engineer raises PR

&#x09;	→ Procurement reviews

&#x09;	→ PM approves

&#x09;	→ Supplier delivers

&#x09;	→ Store receives

&#x09;	👉 Without stakeholder mapping = chaos

&#x09;🧩 D. RFI Flow

&#x09;	Site Engineer raises RFI

&#x09;	→ Consultant responds

&#x09;	→ PM reviews

&#x09;	→ Close

&#x09;	👉 If responder not assigned → system dead



#### **7. Stakeholder + Notification (Don’t Ignore This)**



&#x09;“Notify the right person, at the right time, for the right reason”

&#x09;🔥 Example Notification Flow

&#x09;	| Event         | Stakeholder            |

&#x09;	| ------------- | ---------------------- |

&#x09;	| Task assigned | Engineer               |

&#x09;	| Task overdue  | Engineer + PM          |

&#x09;	| RFI created   | Consultant             |

&#x09;	| RFI overdue   | Consultant + Director  |

&#x09;	| PO approved   | Procurement + Supplier |



#### **8. Advanced Control (This is where you become elite)**

&#x09;

&#x09;**A. WBS-Based Responsibility**

&#x09;Instead of assigning only by role:

&#x09;	Building B01 → Engineer A

&#x09;	Level L05 → Engineer B

&#x09;	Zone Z03 → Subcontractor C

&#x09;👉 Now system knows who owns what physically

&#x09;**B. Multi-Level Approval**

&#x09;	Engineer → Lead → PM → Client

&#x09;	Each stakeholder = gatekeeper

&#x09;**C. Stakeholder Performance Tracking**

&#x09;You should track:

&#x09;	Response time

&#x09;	Approval delay

&#x09;	Task completion rate

&#x09;	RFI turnaround

&#x09;👉 This feeds KPI dashboard later





































