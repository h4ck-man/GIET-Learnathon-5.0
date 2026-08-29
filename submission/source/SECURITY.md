# Security Architecture & Posture Summary — HostelGrievance

## 1. Executive Summary

HostelGrievance is a university grievance redressal platform designed for students and hostel wardens. The baseline application underwent a comprehensive source code security audit, red-team exploitation verification, defensive hardening, and regression testing.

Prior to hardening, the application suffered from broken access controls (IDOR/BOLA), horizontal and vertical privilege escalation, server-side session persistence vulnerabilities, stored cross-site scripting (XSS), insecure file storage, and overly permissive CORS. Following systematic remediation, the system enforces strict server-authoritative access control, binary magic-byte upload validation, cryptographic session lifecycle management, and defense-in-depth HTTP security headers.

---

## 2. Security Posture: Before vs. After Hardening

| Category | Baseline State (Before Hardening) | Hardened State (After Remediation) |
|---|---|---|
| **Authorization** | Route guards only in UI; API lacked ownership checks on ticket retrieval, comments, patching, and attachments. | Server-authoritative ownership enforcement (`assertCanViewGrievance`) on all endpoints; strict role segregation. |
| **Authentication & Sessions** | Logout did not delete session in DB; sessions had no active expiration check; cookies lacked `HttpOnly` and `SameSite`. | Server-side session destruction on logout; active expiration TTL checks; cookies configured with `HttpOnly`, `SameSite=Lax`, and `Path=/`. |
| **Cross-Site Scripting (XSS)** | Comment timeline rendered raw unescaped HTML (`{@html comment.body}`). | Direct Svelte text interpolation `{comment.body}` auto-escapes all HTML/script payloads. |
| **File Storage & Uploads** | Trusted client filename on disk; client MIME header trusted blindly; path traversal risk. | Cryptographically random disk names; binary magic-byte inspection (JPEG, PNG, GIF, WebP); strict path containment. |
| **CORS Policy** | Reflected arbitrary `Origin` headers with `credentials: true`. | Strict origin whitelist (localhost/127.0.0.1 and configured production origins). |
| **Security Headers** | Missing standard security headers. | Global middleware enforcing `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Content-Security-Policy`. |
| **Password Security** | Plain unsalted SHA-256 hashes. | Salted PBKDF2 hashing (100,000 iterations SHA-256) with constant-time verification and legacy compatibility. |
| **Rate Limiting** | Unlimited request throughput on sensitive routes. | Sliding-window IP rate limiting on login and grievance creation. |

---

## 3. Core Security Architecture

### A. Authentication & Session Management
- **Token Generation:** 32-byte cryptographically secure random tokens generated using `node:crypto` `randomBytes(32).toString('base64url')`.
- **Cookie Security:**
  - `HttpOnly: true` (prevents JavaScript access to cookie).
  - `SameSite: Lax` (prevents CSRF while allowing top-level navigation).
  - `Secure: true` (in production environments).
  - `Path: /`.
- **Lifecycle & Expiration:** Every session is stored in the database with an `expires_at` timestamp. `readSessionUser` checks if the current time exceeds `expires_at`; if expired, the token is purged from the database and authentication is rejected (401).
- **Logout:** `POST /api/logout` immediately deletes the session token from SQLite and clears the client cookie.

### B. Server-Authoritative Authorization Model
The system enforces the principle that **the frontend is never a security boundary**.
- **Role Verification:**
  - `Student`: Can create grievances, view and comment on their own grievances, and edit the content of their own open grievances. Cannot alter ticket status.
  - `Warden`: Can view all hostel grievances, update ticket statuses (Open -> In Progress -> Resolved), and post official comments. Cannot alter the student's grievance content.
- **Resource Ownership Helper:**
  ```ts
  export function assertCanViewGrievance(user: SessionUser, row: GrievanceRow): void {
    if (user.role === 'warden') return;
    if (user.role === 'student' && row.student_id === user.id) return;
    throw new HttpError(403, 'unauthorized', 'You cannot access this grievance.');
  }
  ```

### C. File Upload Security & Magic-Byte Verification
- **Storage Isolation:** Files are written strictly inside the `uploads/` directory.
- **Filename Randomization:** Disk filenames are generated using 16 random cryptographic bytes (`[0-9a-f]{32}.ext`). User-supplied names are only stored as metadata in the database after sanitization.
- **Content Inspection:** The server validates file signatures (magic bytes) to ensure uploaded bytes match allowed image types:
  - JPEG: `0xFF 0xD8 0xFF`
  - PNG: `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`
  - GIF: `GIF87a` / `GIF89a`
  - WebP: `RIFF....WEBP`
- **Serving Protections:** Served with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`.

---

## 4. Blast Radius Analysis

In the event that an individual defensive control is bypassed, the system relies on layered defense-in-depth:

| Failed Component | Failure Scenario | Secondary Containment Controls | Blast Radius |
|---|---|---|---|
| **Client-Side Guard** | Attacker bypasses Svelte route guard using direct cURL/fetch API calls. | All Hono API endpoints independently verify session token, user role, and grievance ownership in SQLite. | **Zero:** Unauthorized data access is completely blocked at the API layer. |
| **XSS Filter (Hypothetical)** | An attacker finds a way to store a script payload in comments. | Session cookie is `HttpOnly` (cannot be stolen via `document.cookie`); API enforces strict CSP preventing inline script execution; attachment downloads are sandboxed. | **Low:** Session token remains protected; attacker cannot achieve account takeover. |
| **MIME-Type Validation** | Client bypasses file extension check. | Binary magic-byte inspection verifies genuine image signatures; disk filename is randomized (no execution of script extensions). | **Zero:** Disguised scripts/executables are rejected or rendered inert. |
| **Database File Leak** | Attacker obtains a raw dump of `data/hostel.db`. | Passwords use salted PBKDF2 with 100,000 iterations; rainbow tables are ineffective; session tokens have short TTLs. | **Medium:** Grievance metadata exposed, but credentials require computationally heavy brute-force per user. |

---

## 5. Deployment Assumptions & Operational Guidance

1. **HTTPS / TLS Termination:** The application assumes deployment behind a reverse proxy (e.g., NGINX, Cloudflare, or Caddy) that terminates TLS and forwards the `X-Forwarded-For` header.
2. **Environment Variables:**
   - Set `NODE_ENV=production` to enable secure cookie flags.
   - Set `ALLOWED_ORIGINS` to a comma-separated list of trusted frontend domains (e.g., `https://hostel.giet.edu`).
3. **Database & Storage Permissions:** Ensure `data/` and `uploads/` directories have restricted operating system permissions (readable/writable only by the application process user).

---

## 6. What the System Is and Is NOT Protected Against

### Protected Against:
- Broken Object Level Authorization (IDOR / BOLA) on grievances, comments, and attachments.
- Vertical privilege escalation (students resolving tickets or accessing warden functions).
- Stored and Reflected Cross-Site Scripting (XSS).
- SQL injection (100% parameterized SQLite statements).
- Cross-Site Request Forgery (SameSite cookies + strict CORS).
- Arbitrary file upload, path traversal, and executable file uploads.
- Session fixation, stale session persistence, and client-side cookie theft.
- Automated brute-force credential stuffing (rate limiting).

### NOT Designed to Protect Against:
- Compromise of the underlying operating system or host server infrastructure.
- Malicious authorized warden abusing their legitimate administrative access to view student grievances.
- Distributed Denial of Service (DDoS) across massive botnets (requires external CDN/WAF).
- Physical device compromise where a user leaves their unlocked browser unattended.
