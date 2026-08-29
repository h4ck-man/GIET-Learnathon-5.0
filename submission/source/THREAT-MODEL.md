# Threat Model — HostelGrievance Portal

## 1. System Overview & Architecture

HostelGrievance is a university grievance redressal platform consisting of:
- **Frontend:** Single-page application built with Svelte 5, TypeScript, and Tailwind CSS.
- **Backend API:** Lightweight REST API built with Hono on Node.js.
- **Database:** Local SQLite database accessed via `better-sqlite3`.
- **Storage:** Local server filesystem (`uploads/`) storing user-submitted grievance attachments.

```text
+-----------------------------------------------------------------------+
|                             Client Browser                            |
|  +-----------------------------------------------------------------+  |
|  |                 Svelte 5 Client-Side Application                |  |
|  |   - Auth Store / Session state                                  |  |
|  |   - UI Components / Route guards                                |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
                                  |
              [ HTTPS / HTTP Cookie: hg_session (Lax, HttpOnly) ]
                                  v
+-----------------------------------------------------------------------+
|                         Trust Boundary: API Gateway                    |
|  +-----------------------------------------------------------------+  |
|  |                    Hono API Server (Node.js)                    |  |
|  |   - Security Headers (nosniff, DENY, CSP)                       |  |
|  |   - Strict CORS Whitelist                                       |  |
|  |   - Rate Limiter (Login & Grievance limits)                     |  |
|  |   - Session Auth Middleware (requireUser)                       |  |
|  |   - Authorization & Ownership Guards (assertCanViewGrievance)   |  |
|  |   - Input Validation & Magic-Byte Verifier                      |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
                     |                                |
         [ Parameterized SQL ]            [ Validated Path & Bytes ]
                     v                                v
+--------------------------------+   +----------------------------------+
|      SQLite Database           |   |       Filesystem Storage         |
|      `data/hostel.db`          |   |       `uploads/[a-f0-9].ext`     |
|   - Users & Password Hashes    |   |   - Isolated image storage       |
|   - Active Sessions            |   |   - Unlinkable random filenames  |
|   - Grievances & Comments      |   +----------------------------------+
|   - Attachment Metadata        |
+--------------------------------+
```

---

## 2. Protected Assets

The system must protect the confidentiality, integrity, and availability of the following assets:

| Asset | Description | Sensitivity | Security Requirements |
|---|---|---|---|
| **Student Identities & PII** | Names, room numbers, university email addresses. | Medium | Restricted to authorized users (self and warden). |
| **Authentication Credentials** | Password hashes stored in the SQLite database. | Critical | Strong one-way salted hashing (PBKDF2/scrypt), never leaked in API responses. |
| **Session Tokens** | Active 32-byte cryptographic session identifiers. | Critical | Inaccessible to JavaScript (`HttpOnly`), cryptographically unpredictable, invalidated on logout. |
| **Grievance Records** | Descriptions, categories, timestamps, and resolution states of student complaints. | High | Tenant isolation: students can only access their own tickets; wardens can manage all tickets. |
| **Grievance Comments** | Private discussions between students and hostel wardens regarding resolution progress. | High | Restricted exclusively to ticket owner and wardens. |
| **Uploaded Attachments** | Photo evidence of hostel damage/facilities uploaded by students. | High | Access controlled; restricted file types; safe randomized storage avoiding filesystem compromise. |
| **Database & Server Filesystem** | SQLite file (`hostel.db`), configuration files, source code, and host filesystem. | Critical | Zero path traversal, zero unauthorized SQL execution, strict access permissions. |

---

## 3. Threat Actors & Attacker Capabilities

| Threat Actor | Description | Capabilities | Motivation |
|---|---|---|---|
| **Unauthenticated Visitor** | External Internet or network user without valid credentials. | Direct HTTP API requests, network sniffing, brute-force attacks. | Unauthorized data discovery, user enumeration, server compromise. |
| **Legitimate Student** | Authenticated university student residing in hostel. | Access to student portal, ability to file grievances and view own tickets. | Intended portal usage. |
| **Malicious Student / Insider** | Authenticated student attempting unauthorized actions. | Direct API manipulation via DevTools/cURL, ID tampering, privilege escalation attempts, cross-student snooping. | Viewing other students' grievances, modifying ticket statuses, injecting malicious comments or files. |
| **Hostel Warden** | Administrative staff member. | Full visibility of all grievances, updating status from Open to Resolved, posting official comments. | Administrative grievance management. |
| **Compromised User Session** | Attacker who obtained a session cookie via interception or stolen device. | Replaying session cookie in HTTP requests. | Impersonating student or warden. |

---

## 4. Trust Boundaries

1. **Browser to API Boundary:**
   - Client-side code, forms, disabled buttons, and frontend route guards are untrusted.
   - All authorization decisions must be validated server-side based on the authenticated session token.
2. **Student to Student Data Boundary (Multi-Tenancy Isolation):**
   - Each student is an isolated tenant. No student should be able to view, edit, or comment on another student's grievance or attachment.
3. **Student to Warden Role Boundary (Vertical Privilege Separation):**
   - Only wardens are authorized to transition ticket statuses (Open -> In Progress -> Resolved).
   - Wardens cannot modify the student's original grievance description/title.
4. **API to Database Boundary:**
   - Untrusted request inputs must never be directly concatenated into SQL statements.
5. **API to Host Filesystem Boundary:**
   - Uploaded files must be validated, decoupled from user-supplied filenames, and constrained inside `uploads/`.

---

## 5. Data Flow Diagrams

### A. Authentication Data Flow
```text
[ Browser ] --( POST /api/login {email, password} )--> [ Hono API ]
                                                              |
                                                    [ Find user by email ]
                                                              |
                                                              v
                                                    [ Verify Password (PBKDF2/SHA256) ]
                                                              |
                                                     (If Valid: Create Session)
                                                              |
                                                              v
[ Browser ] <--( 200 OK + Set-Cookie: hg_session=...; HttpOnly; SameSite=Lax )--
```

### B. Grievance Access & Authorization Flow
```text
[ Client ] --( GET /api/grievances/GRV-0003 + Cookie: hg_session )--> [ Hono API ]
                                                                            |
                                                                [ Extract session & Lookup User ]
                                                                            |
                                                                 (If not found -> 401 Unauthorized)
                                                                            |
                                                                            v
                                                                [ Load Grievance Row from DB ]
                                                                            |
                                                                 (If not found -> 404 Not Found)
                                                                            |
                                                                            v
                                                                [ assertCanViewGrievance(user, row) ]
                                                                            |
                                                                +-----------+-----------+
                                                                |                       |
                                                      (Student != Owner)       (Owner OR Warden)
                                                                |                       |
                                                                v                       v
                                                        [ 403 Forbidden ]         [ 200 OK + Data ]
```

---

## 6. Attack Paths Discovered & Remediated

### Attack Path 1: IDOR / BOLA Across Student Grievances (H-01)
- **Vector:** Attacker logged in as Student A sends `GET /api/grievances/GRV-0003` (belonging to Student B).
- **Exploitation:** Server returned full record because route lacked ownership check.
- **Remediation:** Enforced `assertCanViewGrievance(user, row)` returning `403 Forbidden` if `row.student_id !== user.id`.

### Attack Path 2: Unauthorized Status Escalation via PATCH (H-03)
- **Vector:** Student A sends `PATCH /api/grievances/GRV-0008` with `{"status": "Resolved"}`.
- **Exploitation:** The API accepted `status` updates from student role without restricting status changes to wardens.
- **Remediation:** Enforced role checks in `PATCH` — student role attempting status update receives `403 Forbidden`.

### Attack Path 3: Malicious File Upload & MIME Spoofing (H-10)
- **Vector:** Attacker uploads `evil.html` disguised with header `Content-Type: image/png` or named `../../evil.html`.
- **Exploitation:** File written using attacker's filename and served inline to users.
- **Remediation:** Mandatory binary magic-byte verification, random UUID/hex disk filenames, path containment checks, and CSP sandbox headers.

### Attack Path 4: Stored Cross-Site Scripting via Comments (H-09)
- **Vector:** Attacker submits comment body `<img src=x onerror="stealSession()">`.
- **Exploitation:** Frontend rendered comment using `{@html comment.body}`, executing script in warden's browser.
- **Remediation:** Replaced `{@html}` with safe Svelte text rendering `{comment.body}`.

### Attack Path 5: Replayed Zombie Sessions on Logout (H-05)
- **Vector:** Attacker obtains session cookie; victim logs out; attacker continues using cookie.
- **Exploitation:** Logout only deleted browser cookie but left token in database.
- **Remediation:** Explicit `destroySession(db, token)` deletes the record from the database on logout.
