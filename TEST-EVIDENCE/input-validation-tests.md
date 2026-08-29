# Input Validation, XSS & Attack Prevention Test Evidence

## Test Summary

This document captures empirical test evidence demonstrating the remediation of input validation failures, Stored Cross-Site Scripting (XSS), SQL injection resistance, and CORS bypasses.

---

## 1. Stored Cross-Site Scripting (XSS) Prevention — Finding H-09

### Attack Scenario
- A malicious student or user files a comment or grievance containing raw HTML / JavaScript payload:
  ```html
  <img src=x onerror="fetch('/api/me').then(r=>r.json()).then(d=>console.log(d))">
  ```
- **Pre-Fix Vulnerability:** In `src/lib/components/app/comment-timeline.svelte`, line 49 rendered comments using `{@html comment.body}`.
- **Impact:** Any student or warden opening the grievance executed the attacker's script in their browser session with full cookie and DOM access.

### Hardened Implementation
- Removed `{@html}` and replaced it with safe Svelte text interpolation `{comment.body}`. Svelte automatically escapes all HTML tags and attributes into plain text entities.

### Verification
- Tested with `<script>`, `<img src=x onerror=...>`, and nested SVG payloads. All characters (`<`, `>`, `&`, `"`, `'`) are rendered harmlessly as text in the timeline.

---

## 2. SQL Injection Resistance

### Architectural Control
- All database queries across `src/server/db/queries.ts`, `src/server/auth/session.ts`, and `src/server/routes/` utilize parameterized SQLite queries with `?` or named placeholders `@param`.
- Zero dynamic query string concatenation exists for user inputs.

### Verification
- Tested grievance search and ID lookups with SQLi payloads:
  - `' OR 1=1 --`
  - `GRV-0001' UNION SELECT * FROM users --`
- Parameterized statements treated the strings as literal text; lookup returned `404 Not Found` without database error leakage or unauthorized data retrieval.

---

## 3. CORS Policy Hardening — Finding H-08

### Attack Scenario
- An attacker creates `https://evil-hostel-tracker.com` and executes authenticated cross-origin requests (`credentials: 'include'`) targeting the local Hono API.
- **Pre-Fix Vulnerability:** CORS middleware reflected any incoming `Origin` header with `credentials: true`.

### Hardened Implementation
- Replaced permissive reflection with an explicit origin validator:
  ```ts
  function isAllowedOrigin(origin: string | undefined): string | null {
    if (!origin) return null;
    try {
      const host = new URL(origin).hostname;
      if (host === 'localhost' || host === '127.0.0.1') return origin;
      if (process.env.ALLOWED_ORIGINS) {
        const allowed = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
        if (allowed.includes(origin)) return origin;
      }
    } catch {
      return null;
    }
    return null;
  }
  ```

### Verification Test
- **Test Executed:** `it('does not reflect arbitrary malicious origin in Access-Control-Allow-Origin')` in `src/server/security.test.ts`
- **Result:**
  ```text
  ✓ does not reflect arbitrary malicious origin in Access-Control-Allow-Origin (27ms)
  ✓ allows legitimate localhost origins (27ms)
  ```

---

## 4. Password Security & PBKDF2 Hashing — Finding H-13

### Hardened Implementation
- Upgraded password hashing algorithm in `src/server/auth/passwords.ts` to `PBKDF2` with a 16-byte cryptographically random salt, 100,000 SHA-256 iterations, and 32-byte key length.
- Backward compatibility for legacy `sha256:` seeded hashes verified with `timingSafeEqual`.

### Verification Test
- **Test Executed:** `it('hashes new passwords with PBKDF2 and random salt')` and `it('supports backwards compatibility with legacy seeded sha256 hashes')`
- **Result:**
  ```text
  ✓ hashes new passwords with PBKDF2 and random salt (75ms)
  ✓ supports backwards compatibility with legacy seeded sha256 hashes (32ms)
  ```
