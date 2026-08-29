# Authorization & Access Control Test Evidence

## Test Summary

This document captures empirical test evidence proving the remediation of authorization, BOLA/IDOR, privilege escalation, and session management vulnerabilities in the HostelGrievance portal.

---

## 1. IDOR on Grievance Retrieval (`GET /api/grievances/:id`) — Finding H-01

### Vulnerability Verification (Pre-Remediation)
- **Actor:** Authenticated Student A (`student@example.test`, ID: `stu-1`)
- **Action:** Requesting `GET /api/grievances/GRV-0003` (Priya's private grievance, ID: `stu-2`)
- **Pre-Fix Behavior:** The API returned `200 OK` with full grievance metadata, private description, and student details.
- **Root Cause:** Missing `assertCanViewGrievance(user, row)` call in `src/server/routes/grievances.ts`.

### Remediation Verification (Post-Remediation)
- **Command / Test:** `vitest run src/server/security.test.ts`
- **Output:**
  ```text
  ✓ prevents student from accessing another student grievance (76ms)
  ✓ allows warden to view any grievance (39ms)
  ```
- **Response:** `403 Forbidden` with body `{"error":"You cannot access this grievance.","code":"unauthorized"}`.
- **Legitimate Access:** Student Priya (`stu-2`) accessing `GRV-0003` receives `200 OK`. Warden (`war-1`) accessing any grievance receives `200 OK`.

---

## 2. Comments Authorization & Injection (`GET` & `POST /api/grievances/:id/comments`) — Finding H-02

### Vulnerability Verification (Pre-Remediation)
- **Actor:** Student A (`stu-1`)
- **Action:** Requesting `GET /api/grievances/GRV-0003/comments` or `POST /api/grievances/GRV-0003/comments`
- **Pre-Fix Behavior:** Student A could read all private warden-student comment exchanges on Priya's grievance and post unauthorized comments pretending to participate in the resolution.

### Remediation Verification (Post-Remediation)
- **Command / Test:** `vitest run src/server/security.test.ts`
- **Output:**
  ```text
  ✓ prevents unauthorized student from reading comments on another student grievance (40ms)
  ✓ prevents unauthorized student from posting comments on another student grievance (40ms)
  ✓ allows owner student and warden to comment (53ms)
  ```
- **Response:** `403 Forbidden` (`code: unauthorized`) for both read and post requests by unauthorized students.

---

## 3. Privilege Escalation & IDOR in Ticket Modification (`PATCH /api/grievances/:id`) — Finding H-03

### Vulnerability Verification (Pre-Remediation)
- **Actor:** Student A (`stu-1`)
- **Action 1:** `PATCH /api/grievances/GRV-0008` with `{"status": "Resolved"}`.
  - **Pre-Fix Behavior:** Student resolved their own ticket without warden review.
- **Action 2:** `PATCH /api/grievances/GRV-0003` with `{"title": "Tampered"}`.
  - **Pre-Fix Behavior:** Student modified another student's grievance.

### Remediation Verification (Post-Remediation)
- **Command / Test:** `vitest run src/server/security.test.ts`
- **Output:**
  ```text
  ✓ prevents a student from modifying another student grievance (39ms)
  ✓ prevents a student from escalating privileges by altering status (39ms)
  ✓ allows student to update their open grievance content and blocks on resolved grievances (51ms)
  ✓ warden can update status but cannot modify grievance content (40ms)
  ```
- **Response:**
  - Status modification by student returns `403 Forbidden` (`code: unauthorized`).
  - Cross-student modification returns `403 Forbidden` (`code: unauthorized`).
  - Resolved grievance modification returns `409 Conflict` (`code: conflict`).
  - Warden updating status succeeds with `200 OK`.
  - Warden attempting to modify student title/description returns `403 Forbidden`.

---

## 4. Attachment Access Control (`GET /api/attachments/:id`) — Finding H-04

### Vulnerability Verification (Pre-Remediation)
- **Actor:** Student A (`stu-1`)
- **Action:** Requesting `GET /api/attachments/att-3` (Priya's Wi-Fi speed test screenshot).
- **Pre-Fix Behavior:** Server returned the binary image bytes directly to unauthorized students.

### Remediation Verification (Post-Remediation)
- **Command / Test:** `vitest run src/server/security.test.ts`
- **Output:**
  ```text
  ✓ blocks unauthorized student from downloading private grievance attachments (40ms)
  ✓ allows owner student and warden to download attachments (52ms)
  ```
- **Response:** `403 Forbidden` (`code: unauthorized`) for unauthorized students; `200 OK` for the grievance owner and wardens.

---

## 5. Server-Side Session Invalidation (`POST /api/logout`) — Finding H-05

### Vulnerability Verification (Pre-Remediation)
- **Action:** User logs out, then replays the previously held session cookie to `/api/me`.
- **Pre-Fix Behavior:** Because the token was never deleted from the SQLite `sessions` table, the replayed token remained valid (`200 OK`).

### Remediation Verification (Post-Remediation)
- **Command / Test:** `vitest run src/server/security.test.ts`
- **Output:**
  ```text
  ✓ destroys the session in the database upon logout (40ms)
  ```
- **Response:** Replaying the cookie after logout returns `401 Unauthorized` (`code: unauthenticated`).
