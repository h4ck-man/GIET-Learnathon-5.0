# File Upload & Storage Security Test Evidence

## Test Summary

This document captures empirical test evidence for the remediation of file upload, path traversal, stored filename manipulation, and MIME-spoofing vulnerabilities (Finding H-10 and H-11).

---

## 1. Magic Byte Validation & MIME Spoofing

### Attack Scenario
- An attacker attempts to upload an HTML file or script containing `<script>alert(1)</script>` disguised as a PNG (`Content-Type: image/png`, file name `exploit.png`).
- In an unhardened setup relying solely on the client's `Content-Type` header, this file is accepted into the server's uploads folder.

### Hardened Implementation
- The server performs binary header inspections (magic bytes) inside `assertPermittedAttachment`:
  - **JPEG:** `0xFF 0xD8 0xFF`
  - **PNG:** `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`
  - **GIF:** `GIF87a` or `GIF89a`
  - **WebP:** `RIFF....WEBP`

### Verification Test
- **Test Executed:** `it('rejects files with mismatched magic bytes (disguised text/html)')` in `src/server/security.test.ts`
- **Result:**
  ```text
  ✓ rejects files with mismatched magic bytes (disguised text/html) (42ms)
  ```
- **Response:** `400 Bad Request` with body:
  ```json
  {
    "error": "File content does not match the declared image type.",
    "code": "bad_request"
  }
  ```

---

## 2. Path Traversal & Stored Filename Randomization

### Attack Scenario
- An attacker provides a filename with path traversal sequences such as `../../etc/cron.d/backdoor.png` or `malicious.php`.
- In an unhardened setup where `newStoredName` returned `originalName ?? ...`, the application wrote the file using the attacker-supplied name.

### Hardened Implementation
- `newStoredName(mime)` unconditionally generates a cryptographically random hex string:
  ```ts
  export function newStoredName(mime: string): string {
    return `${randomBytes(16).toString('hex')}${extensionForMime(mime)}`;
  }
  ```
- `writeStoredFile` and `readStoredFile` enforce strict path containment checks against `uploadsDir`:
  ```ts
  const root = resolve(uploadsDir);
  const full = resolve(join(uploadsDir, storedName));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new HttpError(400, 'bad_request', 'Invalid attachment destination.');
  }
  ```

### Verification Test
- **Test Executed:** `it('accepts valid PNG image with genuine magic bytes and generates randomized filename')` in `src/server/security.test.ts`
- **Result:**
  ```text
  ✓ accepts valid PNG image with genuine magic bytes and generates randomized filename (40ms)
  ```
- **Verification:**
  - Original filename stored in database is sanitized (`malicious.png`).
  - Stored disk file is strictly formatted as 32 hex characters plus extension (`/^[0-9a-f]{32}\.png$/`), completely isolating the filesystem from user-controlled paths.

---

## 3. Attachment Response Security Headers

### Hardened Implementation
- When serving attachments via `GET /api/attachments/:id`, the server attaches strict defense-in-depth headers:
  - `X-Content-Type-Options: nosniff` (prevents browsers from interpreting image files as HTML or JavaScript)
  - `Content-Security-Policy: default-src 'none'; sandbox` (isolates the rendering context)
  - `Content-Disposition: inline; filename="sanitized_name"` (sanitizes CRLF/quote characters)

### Verification Test
- **Test Executed:** `it('attachment response includes nosniff and CSP sandbox')` in `src/server/security.test.ts`
- **Result:**
  ```text
  ✓ attachment response includes nosniff and CSP sandbox (39ms)
  ```
