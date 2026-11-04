### **System Admin should control account lifecycle**



###### **1. Overall Account Lifecycle**



&#x20;                     SYSTEM ADMIN

&#x20;                          │

&#x20;                          ▼

&#x20;             	┌─────────────────────┐

&#x20;             	│ Create Staff Account│

&#x20;             	└──────────┬──────────┘

&#x20;                          │

&#x20;                          ▼

&#x20;             	┌─────────────────────┐

&#x20;             	│ Assign Email        │

&#x20;             	│ Assign Role         │

&#x20;             	│ Set Initial Password│

&#x20;             	└──────────┬──────────┘

&#x20;                          │

&#x20;                          ▼

&#x20;             	┌─────────────────────┐

&#x20;             	│ Account = INVITED   │

&#x20;             	└──────────┬──────────┘

&#x20;                          │

&#x20;                          ▼

&#x20;                 Staff receives

&#x20;                 email invitation

&#x20;                          │

&#x20;                          ▼

&#x20;             	┌─────────────────────┐

&#x20;             	│ First Login         │

&#x20;             	└──────────┬──────────┘

&#x20;                          │

&#x20;                          ▼

&#x20;             	┌─────────────────────┐

&#x20;             	│ Force Password      │

&#x20;             	│ Change              │

&#x20;             	└──────────┬──────────┘

&#x20;                          │

&#x20;                          ▼

&#x20;             	┌─────────────────────┐

&#x20;             	│ ACTIVE ACCOUNT      │

&#x20;             	└──────────┬──────────┘

&#x20;                          │

&#x20;             	┌──────────┼──────────┐

&#x20;             	▼          ▼          ▼

&#x20;           View Own    Change      Forgot

&#x20;           Profile    Password    Password

&#x20;             │          │            │

&#x20;             │          │            ▼

&#x20;             │          │        Reset Email

&#x20;             │          │            │

&#x20;             │          │            ▼

&#x20;             │          └────►   New Password

&#x20;             │

&#x20;             ▼

&#x20;        Continue Using

&#x20;            System



###### **2. Separate the Responsibilities**



This is the most important design decision.



**2.1 System Admin controls**



&#x09;| Function                        | Admin			|		   

&#x09;| ------------------------------- | ---------------------------	|

&#x09;| Create user                     | ✅  			|                 

&#x09;| Assign email                    | ✅   			|                 

&#x09;| Assign employee ID              | ✅ 				|                   

&#x09;| Assign department               | ✅  			|                  

&#x09;| Assign position                 | ✅ 				|                 

&#x09;| Assign role                     | ✅ 				|                   

&#x09;| Activate account                | ✅ 				|                   

&#x09;| Deactivate account              | ✅ 				|                   

&#x09;| Lock/unlock account             | ✅ 				|                    

&#x09;| Force password reset            | ✅ 				|                   

&#x09;| Reset temporary password        | ✅ 				|                   

&#x09;| View login status               | ✅ 				|                   

&#x09;| View last login                 | ✅ 				|                   

&#x09;| Delete/deactivate account       | ✅ 				|                   

&#x09;| Change user's password directly | ⚠️ Prefer reset flow	|  

&#x09;| View user's current password    | ❌ Never 			|             



**2.2 Staff controls**



&#x09;| Function                       | Staff       

&#x09;| ------------------------------ | ------------	| 

&#x09;| View own profile               | ✅ 		|        

&#x09;| Edit allowed profile fields    | ✅ 		|        

&#x09;| Change own password            | ✅ 		|        

&#x09;| Forgot password                | ✅ 		|        

&#x09;| Request password reset         | ✅ 		|        

&#x09;| View own login history         | Optional	|   

&#x09;| Change own email               | Usually ❌	| 

&#x09;| Change own role                | ❌		|         

&#x09;| Change another user's password | ❌		|         

&#x09;| Create users                   | ❌		|         

&#x09;| Disable users                  | ❌		|         



###### **3. System Admin Workflow**

I would make the Admin module something like:



&#x09;DCOS

&#x20;	│

&#x20;	└── Administration

&#x20;     		│

&#x20;     		├── User Management

&#x20;     		│

&#x20;     		├── Roles \& Permissions

&#x20;     		│

&#x20;     		├── Departments

&#x20;     		│

&#x20;     		├── Security

&#x20;     		│

&#x20;     		└── Audit Logs

Then:



&#x09;Administration

&#x20;     		│

&#x20;     		▼

&#x09;User Management

&#x20;     		│

&#x20;     		├── User List

&#x20;     		│

&#x20;     		└── \[+ Create User]



###### **4. Create New Staff Account**

Admin clicks:



&#x09;Administration → User Management → Create User



The form should contain:



**4.1 Employee Information**



&#x09;Employee ID

&#x09;Employee Name

&#x09;Department

&#x09;Position

&#x09;Phone

**4.2 Login Information**



&#x09;Email

&#x09;Username        \[optional]

&#x09;Initial Password

&#x09;Confirm Password

**4.3 Access Control**



&#x09;Role

&#x09;Department Access

&#x09;Project Access

&#x09;Permission Group



**4.4 Account Status**



&#x09;○ Active

&#x09;○ Pending

&#x09;○ Suspended

&#x09;○ Disabled



But I recommend not allowing Admin to manually choose Active immediately for a new employee.



Instead:



&#x09;Create User

&#x20;    	    ↓

&#x09;Pending Invitation

&#x20;    	    ↓

&#x09;Send Activation Email

&#x20;    	    ↓

&#x09;Staff activates account

&#x20;    	    ↓

&#x09;Active



This gives you a cleaner audit trail.



###### **5. Recommended New User Workflow**



For example:

Admin creates account for John.



&#x09;Admin

&#x20; 	│

&#x20; 	▼

&#x09;Create John

&#x20; 		│

&#x20; 		├── Name

&#x20; 		├── Email

&#x20; 		├── Employee ID

&#x20; 		├── Department

&#x20; 		├── Position

&#x20; 		└── Role

&#x20;      			│

&#x20;      			▼

&#x09;	Account Created

&#x20;      			│

&#x20;      			▼

&#x09;	Status = INVITED

&#x20;      			│

&#x20;      			▼

&#x09;	System sends email

&#x20;      			│

&#x20;      			▼

&#x09;	John receives:

&#x09;	"Your DCOS account has been created"

&#x20;      			│

&#x20;      			▼

&#x09;	John clicks:

&#x09;	\[Activate Account]

&#x20;      			│

&#x20;      			▼

&#x09;	Set Password

&#x20;      			│

&#x20;      			▼

&#x09;	Account = ACTIVE



This is better than emailing the actual permanent password.



###### **6. Initial Password**



There are two possible approaches.

❌ Old-fashioned approach

Admin creates:



&#x09;Email: john@company.com

&#x09;Password: John123456



Then sends the password to John.

This works, but it is not ideal security.

✅ Better approach

Admin creates:



&#x09;**Email: john@company.com**

&#x09;**Role: Structural Engineer**

System generates:

&#x09;Activation Link

Then sends:



&#x09;Your DCOS account has been created.



&#x09;Email: john@company.com



&#x09;Click here to activate your account:

&#x09;\[Activate Account]



John clicks it and creates his own password.

This is the approach I recommend.



###### **7. First Login Workflow**



If you still want Admin to establish an initial password, then use:



&#x09;Admin creates user

&#x20;      		↓

&#x09;Temporary Password

&#x20;      		↓

&#x09;Staff Login

&#x20;      		↓

&#x09;System detects:

&#x09;First Login = TRUE

&#x20;      		↓

&#x09;Force Change Password

&#x20;      		↓

&#x09;New Password

&#x20;      		↓

&#x09;Confirm Password

&#x20;      		↓

&#x09;First Login = FALSE

&#x20;      		↓

&#x09;Dashboard



The temporary password should expire after a short period.



###### **8. Staff Profile Workflow**



After login:



&#x09;Profile

&#x20;  	│

&#x20;  	├── Personal Information

&#x20;  	│

&#x20;  	├── Account Information

&#x20;  	│

&#x20;  	├── Security

&#x20;  	│

&#x20;  	└── Login Activity



For example:

**8.1 My Profile**



&#x09;------------------------------------------------

&#x09;MY PROFILE

&#x09;------------------------------------------------



&#x09;Employee ID       EMP-00125

&#x09;Name              John Smith

&#x09;Email             john@company.com

&#x09;Department        Structural

&#x09;Position          Structural Engineer

&#x09;Role              Engineer



&#x09;Account Status    Active

&#x09;Last Login        22 Aug 2026 08:42



&#x09;\[ Edit Profile ]

&#x09;------------------------------------------------

&#x09;SECURITY



&#x09;Password          \*\*\*\*\*\*\*\*\*\*\*\*\*\*



&#x09;\[ Change Password ]



&#x09;Two-Factor Auth   Disabled

&#x09;\[ Enable ]



&#x09;------------------------------------------------



###### **9. Change Password Workflow**



&#x09;Staff clicks:

&#x09;Profile → Security → Change Password



&#x09;Current Password

&#x20;       	↓

&#x09;New Password

&#x20;       	↓

&#x09;Confirm New Password

&#x20;       	↓

&#x09;\[ Change Password ]

&#x20;       	↓

&#x09;Validate

&#x20;       	↓

&#x09;Password Updated

&#x20;       	↓

&#x09;Invalidate old sessions

&#x20;       	↓

&#x09;Success



I recommend requiring:



&#x09;Current Password

&#x09;New Password

&#x09;Confirm New Password



Password policy could be:



&#x09;Minimum 12 characters

&#x09;Uppercase

&#x09;Lowercase

&#x09;Number

&#x09;Special character



For a company system, 12+ characters is much more sensible than the old “8 characters” ritual.



###### **10. Forgot Password Workflow**



This should be completely independent from the Admin.

Staff goes to:



&#x09;Login

&#x20;	│

&#x20;	└── Forgot Password?



&#x09;Then:

&#x09;Forgot Password

&#x20;      		↓

&#x09;Enter Email

&#x20;      		↓

&#x09;System checks account

&#x20;      		↓

&#x09;Send Password Reset Email

&#x20;      		↓

&#x09;User opens email

&#x20;      		↓

&#x09;\[Reset Password]

&#x20;      		↓

&#x09;New Password

&#x20;      		↓

&#x09;Confirm Password

&#x20;      		↓

&#x09;Password Reset

&#x20;      		↓

&#x09;Login



Important:

Do NOT tell the user:



&#x09;"This email does not exist."



Instead always show:

"If an account exists for this email, a password reset link has been sent."

That prevents people from discovering which company accounts exist.



###### **11. Password Reset Token**



Technically, your backend should create something like:



&#x09;PasswordResetToken

with:



&#x09;User ID

&#x09;Token Hash

&#x09;Created At

&#x09;Expires At

&#x09;Used At

&#x09;IP Address

Example:



&#x09;Token created

&#x20;     		↓

&#x09;Valid for 15–30 minutes

&#x20;     		↓

&#x09;User clicks link

&#x20;     		↓

&#x09;Token validated

&#x20;     		↓

&#x09;User creates new password

&#x20;     		↓

&#x09;Token marked USED

&#x20;     		↓

&#x09;All previous sessions revoked



###### **12. System Admin Reset Workflow**



Sometimes John calls Admin:



&#x09;"I forgot my password."



Admin should not ask John for his password.



Instead:



&#x09;Admin

&#x20; 	↓

&#x09;User Management

&#x20; 	↓

&#x09;Search John

&#x20; 	↓

&#x09;Open User

&#x20; 	↓

&#x09;\[ Force Password Reset ]

&#x20; 	↓

&#x09;Confirmation

&#x20; 	↓

&#x09;System sends reset email

&#x20; 	↓

&#x09;John resets password

So:



&#x09;ADMIN

&#x20; 	│

&#x20; 	└── Force Reset

&#x20;         	│

&#x20;         	▼

&#x20;    	Reset Request

&#x20;         	│

&#x20;        	▼

&#x20;    	 Email User

&#x20;         	│

&#x20;         	▼

&#x20;    	User resets

This is much cleaner.



###### **13. Account Suspension**



You also need this.

Imagine an employee leaves the company.

Admin:



&#x09;User Management

&#x20;      		↓

&#x09;John Smith

&#x20;      		↓

&#x09;\[Disable Account]

&#x20;      		↓

&#x09;Confirmation

&#x20;      		↓

&#x09;Account = DISABLED



Immediately:



&#x09;Login        ❌

&#x09;New Session  ❌

&#x09;API Access   ❌

&#x09;Existing Sessions → Revoke



But **do not delete the employee's historical records.**

This is especially important for DCOS because the user may have created:

&#x09;RFIs

&#x09;Documents

&#x09;BOQs

&#x09;QA/QC inspections

&#x09;Tasks

&#x09;Approvals

&#x09;Reports

&#x09;Claims

&#x09;Transmittals



You need those records to remain.

So:



&#x09;User Account

&#x20;    	↓

&#x09;Disabled

&#x20;    	↓

&#x09;Historical Records remain



Not:

&#x09;DELETE USER

&#x20;    	↓

&#x09;DELETE EVERYTHING



That would be a database horror movie.



###### **14. Recommended User Status**

I recommend these statuses:



&#x09;INVITED

&#x20;  	↓

&#x09;ACTIVE

&#x20;  	↓

&#x09;SUSPENDED

&#x20;  	↓

&#x09;DISABLED



With an additional:

&#x09;LOCKED

for security.



So your system can have:



&#x09;| Status    | Meaning                           |

&#x09;| --------- | --------------------------------- |

&#x09;| Invited   | Account created but not activated |

&#x09;| Active    | Normal user                       |

&#x09;| Locked    | Too many failed login attempts    |

&#x09;| Suspended | Temporarily blocked by admin      |

&#x09;| Disabled  | No longer permitted to login      |



###### **15. Complete Workflow**



Your final architecture should look like this:



&#x20;                        ┌──────────────────────┐

&#x20;                        │    SYSTEM ADMIN      │

&#x20;                        └──────────┬───────────┘

&#x20;                                   │

&#x20;                             Create User

&#x20;                                   │

&#x20;                                   ▼

&#x20;                        ┌──────────────────────┐

&#x20;                        │    USER ACCOUNT      │

&#x20;                        │      INVITED         │

&#x20;                        └──────────┬───────────┘

&#x20;                                   │

&#x20;                             Email Invite

&#x20;                                   │

&#x20;                                   ▼

&#x20;                        ┌──────────────────────┐

&#x20;                        │        STAFF         │

&#x20;                        └──────────┬───────────┘

&#x20;                                   │

&#x20;                            Activate Account

&#x20;                                   │

&#x20;                                   ▼

&#x20;                        ┌──────────────────────┐

&#x20;                        │       ACTIVE         │

&#x20;                        └──────────┬───────────┘

&#x20;                                   │

&#x20;             ┌─────────────────────┼─────────────────────┐

&#x20;             │                     │                     │

&#x20;             ▼                     ▼                     ▼

&#x20;       View Profile          Change Password       Forgot Password

&#x20;             │                     │                     │

&#x20;             │                     ▼                     ▼

&#x20;             │              Verify Current        Reset Email

&#x20;             │                 Password                  │

&#x20;             │                     │                     ▼

&#x20;             │                     ▼                New Password

&#x20;             │                New Password               │

&#x20;             │                     │                     │

&#x20;             └──────────────► DASHBOARD  ◄───────────────┘





&#x20;                        ADMIN CONTROL

&#x20;                             │

&#x20;            ┌────────────────┼────────────────┐

&#x20;            ▼                ▼                ▼

&#x20;         Activate         Suspend          Disable

&#x20;            │                │                │

&#x20;            └────────────────┼────────────────┘

&#x20;                             ▼

&#x20;                        Audit Log



###### **16. Database Structure**



For your DCOS architecture, don't put everything into one users table.

At minimum I'd separate:



&#x09;users

&#x09;user\_profiles

&#x09;user\_credentials

&#x09;user\_roles

&#x09;user\_sessions

&#x09;password\_reset\_tokens

&#x09;email\_verification\_tokens

&#x09;login\_attempts

&#x09;audit\_logs



Conceptually:

&#x09;users

&#x20;	│

&#x20;	├── user\_profiles

&#x20;	│

&#x20;	├── user\_credentials

&#x20;	│

&#x20;	├── user\_roles

&#x20;	│

&#x20;	├── user\_sessions

&#x20;	│

&#x20;	├── password\_reset\_tokens

&#x20;	│

&#x20;	└── login\_attempts

And:



&#x09;users

&#x20; 	│

&#x20; 	└──── audit\_logs



This becomes extremely useful later when your DCOS grows.



###### **17. Admin Dashboard**



I would make the System Admin dashboard show:



&#x09;USER MANAGEMENT

&#x09;────────────────────────────────────



&#x09;Total Users             126

&#x09;Active Users            117

&#x09;Pending Invitations       4

&#x09;Locked Accounts           2

&#x09;Disabled Accounts         3



&#x09;────────────────────────────────────



&#x09;Recent Account Activity



&#x09;08:42  John Smith logged in

&#x09;08:35  Admin created Mary Lee

&#x09;08:21  David changed password

&#x09;08:10  Admin disabled user EMP-0042



&#x09;────────────────────────────────────



&#x09;\[ + Create User ]

&#x09;\[ User List ]

&#x09;\[ Roles \& Permissions ]

&#x09;\[ Security ]

&#x09;\[ Audit Logs ]



###### **18. The Key Principle**



I would define the security boundary like this:



&#x20;                SYSTEM ADMIN

&#x20;                     │

&#x20;       ┌─────────────┼─────────────┐

&#x20;       │             │             │

&#x20;    Identity       Access       Security

&#x20;       │             │             │

&#x20;     Email          Role       Lock/Reset

&#x20;     Profile       Project      Disable

&#x20;     Employee      Permission   Audit

&#x20;       │             │             │

&#x20;       └─────────────┼─────────────┘

&#x20;                     │

&#x20;                     ▼

&#x20;                   USER

&#x20;                     │

&#x20;            ┌────────┴────────┐

&#x20;            │                 │

&#x20;         Own Data          Own Security

&#x20;            │                 │

&#x20;         Profile         Change Password

&#x20;         Account         Forgot Password



**Admin owns the account lifecycle.**

**User owns their personal credentials.**

**The system owns the security enforcement and audit trail.**



That separation will scale much better when you later connect this authentication system to your RBAC → **Project → Department → Module → Permission** architecture in DCOS.













