import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { openDatabase } from './db/connection.ts';
import { seedDatabase } from './db/seed.ts';
import { hashPassword, verifyPassword } from './auth/passwords.ts';
import { readSessionUser } from './auth/session.ts';

const VALID_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

function cookieHeader(res: Response): string {
	const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
	const list = anyHeaders.getSetCookie?.() ?? [];
	if (list.length > 0) {
		return list.map((v) => v.split(';')[0]).join('; ');
	}
	const raw = res.headers.get('set-cookie');
	return raw ? raw.split(';')[0] : '';
}

function fullSetCookieHeaders(res: Response): string[] {
	const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
	const list = anyHeaders.getSetCookie?.() ?? [];
	if (list.length > 0) return list;
	const raw = res.headers.get('set-cookie');
	return raw ? [raw] : [];
}

async function login(app: ReturnType<typeof createApp>, email: string, password: string) {
	const res = await app.request('/api/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const json = await res.json();
	return { res, json, cookie: cookieHeader(res) };
}

describe('HostelGrievance Security & Hardening Regression Tests', () => {
	let dir: string;
	let db: ReturnType<typeof openDatabase>;
	let uploadDir: string;
	let app: ReturnType<typeof createApp>;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'hg-sec-'));
		db = openDatabase(join(dir, 'hostel.db'));
		uploadDir = join(dir, 'uploads');
		seedDatabase(db, uploadDir);
		app = createApp({ db, uploadsDir: uploadDir });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	describe('H-01: Grievance Detail Access Control (IDOR / BOLA)', () => {
		it('prevents student from accessing another student grievance', async () => {
			const aarav = await login(app, 'student@example.test', 'student123'); // stu-1
			const priya = await login(app, 'priya@example.test', 'student123'); // stu-2

			// GRV-0003 belongs to Priya (stu-2)
			const unauthorizedRes = await app.request('/api/grievances/GRV-0003', {
				headers: { Cookie: aarav.cookie }
			});
			expect(unauthorizedRes.status).toBe(403);
			const json = await unauthorizedRes.json();
			expect(json.code).toBe('unauthorized');

			// Priya can access her own grievance
			const authorizedRes = await app.request('/api/grievances/GRV-0003', {
				headers: { Cookie: priya.cookie }
			});
			expect(authorizedRes.status).toBe(200);
		});

		it('allows warden to view any grievance', async () => {
			const warden = await login(app, 'warden@example.test', 'warden123');
			const res = await app.request('/api/grievances/GRV-0003', {
				headers: { Cookie: warden.cookie }
			});
			expect(res.status).toBe(200);
		});
	});

	describe('H-02: Comments Authorization & Injection Protection', () => {
		it('prevents unauthorized student from reading comments on another student grievance', async () => {
			const aarav = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances/GRV-0003/comments', {
				headers: { Cookie: aarav.cookie }
			});
			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.code).toBe('unauthorized');
		});

		it('prevents unauthorized student from posting comments on another student grievance', async () => {
			const aarav = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances/GRV-0003/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: aarav.cookie },
				body: JSON.stringify({ body: 'Unauthorized comment injection attempt' })
			});
			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.code).toBe('unauthorized');
		});

		it('allows owner student and warden to comment', async () => {
			const priya = await login(app, 'priya@example.test', 'student123');
			const priyaComment = await app.request('/api/grievances/GRV-0003/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: priya.cookie },
				body: JSON.stringify({ body: 'Wi-Fi is still unstable today.' })
			});
			expect(priyaComment.status).toBe(201);

			const warden = await login(app, 'warden@example.test', 'warden123');
			const wardenComment = await app.request('/api/grievances/GRV-0003/comments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: warden.cookie },
				body: JSON.stringify({ body: 'Technician visit scheduled.' })
			});
			expect(wardenComment.status).toBe(201);
		});
	});

	describe('H-03: Grievance Modification & Privilege Escalation (PATCH)', () => {
		it('prevents a student from modifying another student grievance', async () => {
			const priya = await login(app, 'priya@example.test', 'student123');
			// GRV-0008 belongs to Aarav (stu-1)
			const res = await app.request('/api/grievances/GRV-0008', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Cookie: priya.cookie },
				body: JSON.stringify({ title: 'Tampered title attempt' })
			});
			expect(res.status).toBe(403);
		});

		it('prevents a student from escalating privileges by altering status', async () => {
			const aarav = await login(app, 'student@example.test', 'student123');
			// GRV-0008 is Aarav's own grievance
			const res = await app.request('/api/grievances/GRV-0008', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Cookie: aarav.cookie },
				body: JSON.stringify({ status: 'Resolved' })
			});
			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.code).toBe('unauthorized');
		});

		it('allows student to update their open grievance content and blocks on resolved grievances', async () => {
			const aarav = await login(app, 'student@example.test', 'student123');
			const okRes = await app.request('/api/grievances/GRV-0008', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Cookie: aarav.cookie },
				body: JSON.stringify({
					title: 'Mess tables remain uncleaned',
					description: 'Housekeeping staff missed the tables again tonight after 8pm service.'
				})
			});
			expect(okRes.status).toBe(200);

			// Rohan's resolved grievance GRV-0004
			const rohan = await login(app, 'rohan@example.test', 'student123');
			const resolvedRes = await app.request('/api/grievances/GRV-0004', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Cookie: rohan.cookie },
				body: JSON.stringify({ title: 'Trying to modify resolved issue' })
			});
			expect(resolvedRes.status).toBe(409);
		});

		it('warden can update status but cannot modify grievance content', async () => {
			const warden = await login(app, 'warden@example.test', 'warden123');
			const contentAttempt = await app.request('/api/grievances/GRV-0008', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Cookie: warden.cookie },
				body: JSON.stringify({ title: 'Warden editing description' })
			});
			expect(contentAttempt.status).toBe(403);

			const statusChange = await app.request('/api/grievances/GRV-0008', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Cookie: warden.cookie },
				body: JSON.stringify({ status: 'In Progress' })
			});
			expect(statusChange.status).toBe(200);
		});
	});

	describe('H-04: Attachment Download Authorization (IDOR)', () => {
		it('blocks unauthorized student from downloading private grievance attachments', async () => {
			const priya = await login(app, 'priya@example.test', 'student123'); // stu-2
			// att-1 belongs to GRV-0001 (Aarav, stu-1)
			const res = await app.request('/api/attachments/att-1', {
				headers: { Cookie: priya.cookie }
			});
			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.code).toBe('unauthorized');
		});

		it('allows owner student and warden to download attachments', async () => {
			const aarav = await login(app, 'student@example.test', 'student123');
			const studentDownload = await app.request('/api/attachments/att-1', {
				headers: { Cookie: aarav.cookie }
			});
			expect(studentDownload.status).toBe(200);
			expect(studentDownload.headers.get('content-type')).toBe('image/jpeg');

			const warden = await login(app, 'warden@example.test', 'warden123');
			const wardenDownload = await app.request('/api/attachments/att-1', {
				headers: { Cookie: warden.cookie }
			});
			expect(wardenDownload.status).toBe(200);
		});
	});

	describe('H-05: Server-Side Session Invalidation on Logout', () => {
		it('destroys the session in the database upon logout', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const beforeLogout = await app.request('/api/me', { headers: { Cookie: cookie } });
			expect(beforeLogout.status).toBe(200);

			// Perform logout
			const logoutRes = await app.request('/api/logout', {
				method: 'POST',
				headers: { Cookie: cookie }
			});
			expect(logoutRes.status).toBe(200);

			// Replaying the old session cookie must now fail with 401
			const afterLogout = await app.request('/api/me', { headers: { Cookie: cookie } });
			expect(afterLogout.status).toBe(401);
		});
	});

	describe('H-06: Session Expiration Enforcement', () => {
		it('rejects expired sessions and purges them from the database', async () => {
			const expiredToken = 'expired-token-xyz-123';
			const expiredTime = new Date(Date.now() - 3600 * 1000).toISOString();
			db.prepare(
				'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
			).run(expiredToken, 'stu-1', expiredTime, expiredTime);

			const sessionUser = readSessionUser(db, expiredToken);
			expect(sessionUser).toBeUndefined();

			const res = await app.request('/api/me', {
				headers: { Cookie: `hg_session=${expiredToken}` }
			});
			expect(res.status).toBe(401);
		});
	});

	describe('H-07: Secure Cookie Configuration', () => {
		it('sets HttpOnly, SameSite=Lax, and Path=/ on session cookie', async () => {
			const res = await app.request('/api/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'student@example.test', password: 'student123' })
			});
			expect(res.status).toBe(200);
			const setCookieHeaders = fullSetCookieHeaders(res).join('; ');
			expect(setCookieHeaders.toLowerCase()).toContain('httponly');
			expect(setCookieHeaders.toLowerCase()).toContain('samesite=lax');
			expect(setCookieHeaders.toLowerCase()).toContain('path=/');
		});
	});

	describe('H-08: CORS Origin Restrictions', () => {
		it('does not reflect arbitrary malicious origin in Access-Control-Allow-Origin', async () => {
			const res = await app.request('/api/health', {
				headers: { Origin: 'https://evil.attacker.com' }
			});
			const allowOrigin = res.headers.get('access-control-allow-origin');
			expect(allowOrigin).not.toBe('https://evil.attacker.com');
		});

		it('allows legitimate localhost origins', async () => {
			const res = await app.request('/api/health', {
				headers: { Origin: 'http://localhost:5173' }
			});
			expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
		});
	});

	describe('H-10: File Upload Security & Magic Byte Validation', () => {
		it('rejects files with mismatched magic bytes (disguised text/html)', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const fakeImage = new File(['<script>alert(1)</script>'], 'exploit.png', {
				type: 'image/png'
			});
			const form = new FormData();
			form.append('file', fakeImage);

			const res = await app.request('/api/grievances/GRV-0008/attachments', {
				method: 'POST',
				headers: { Cookie: cookie },
				body: form
			});
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.error).toContain('File content does not match');
		});

		it('accepts valid PNG image with genuine magic bytes and generates randomized filename', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const validImage = new File([VALID_PNG], '../../etc/malicious.png', {
				type: 'image/png'
			});
			const form = new FormData();
			form.append('file', validImage);

			const res = await app.request('/api/grievances/GRV-0008/attachments', {
				method: 'POST',
				headers: { Cookie: cookie },
				body: form
			});
			expect(res.status).toBe(201);
			const json = await res.json();
			expect(json.data.filename).toBe('malicious.png');

			// Verify disk file is stored with random UUID/hex, not path traversal name
			const attRow = db
				.prepare('SELECT stored_filename FROM attachments WHERE id = ?')
				.get(json.data.id) as { stored_filename: string };
			expect(attRow.stored_filename).toMatch(/^[0-9a-f]{32}\.png$/);
		});
	});

	describe('H-11: Security Headers on Responses', () => {
		it('includes X-Content-Type-Options, X-Frame-Options, CSP, and Referrer-Policy', async () => {
			const res = await app.request('/api/health');
			expect(res.headers.get('x-content-type-options')).toBe('nosniff');
			expect(res.headers.get('x-frame-options')).toBe('DENY');
			expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
			expect(res.headers.get('content-security-policy')).toBeDefined();
		});

		it('attachment response includes nosniff and CSP sandbox', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/attachments/att-1', {
				headers: { Cookie: cookie }
			});
			expect(res.headers.get('x-content-type-options')).toBe('nosniff');
			expect(res.headers.get('content-security-policy')).toContain('sandbox');
		});
	});

	describe('H-13: Salted Password Hashing & Verification', () => {
		it('hashes new passwords with PBKDF2 and random salt', () => {
			const pass = 'SuperSecret123!';
			const hash1 = hashPassword(pass);
			const hash2 = hashPassword(pass);
			expect(hash1).toMatch(/^pbkdf2:[0-9a-f]{32}:[0-9a-f]{64}$/);
			expect(hash2).toMatch(/^pbkdf2:[0-9a-f]{32}:[0-9a-f]{64}$/);
			expect(hash1).not.toBe(hash2); // Different salts generate different hashes

			expect(verifyPassword(pass, hash1)).toBe(true);
			expect(verifyPassword('WrongPass', hash1)).toBe(false);
		});

		it('supports backwards compatibility and automatically upgrades legacy sha256 to pbkdf2 on login', async () => {
			const legacySha256 = `sha256:${Buffer.from(
				createHash('sha256').update('student123').digest()
			).toString('hex')}`;
			db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(legacySha256, 'stu-1');

			const aaravBefore = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('stu-1') as {
				password_hash: string;
			};
			expect(aaravBefore.password_hash.startsWith('sha256:')).toBe(true);

			// Log in with legacy account
			const res = await app.request('/api/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'student@example.test', password: 'student123' })
			});
			expect(res.status).toBe(200);

			// Database hash should now be upgraded to pbkdf2!
			const aaravAfter = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('stu-1') as {
				password_hash: string;
			};
			expect(aaravAfter.password_hash.startsWith('pbkdf2:')).toBe(true);
			expect(verifyPassword('student123', aaravAfter.password_hash)).toBe(true);
		});
	});

	describe('Advanced Input Boundary & Hardening Checks', () => {
		it('rejects oversized email or password payloads', async () => {
			const hugeEmail = 'a'.repeat(250) + '@example.com';
			const res = await app.request('/api/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: hugeEmail, password: 'p'.repeat(150) })
			});
			expect(res.status).toBe(400);
			const json = await res.json();
			expect(json.code).toBe('bad_request');
		});

		it('rejects oversized grievance title and description', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Cookie: cookie },
				body: JSON.stringify({
					title: 'T'.repeat(201),
					category: 'Room',
					description: 'D'.repeat(4000)
				})
			});
			expect(res.status).toBe(400);
		});

		it('includes COOP, CORP, and Permissions-Policy security headers', async () => {
			const res = await app.request('/api/health');
			expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
			expect(res.headers.get('cross-origin-resource-policy')).toBe('same-site');
			expect(res.headers.get('permissions-policy')).toBeDefined();
		});

		it('serves attachments with private cache control and nosniff', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/attachments/att-1', {
				headers: { Cookie: cookie }
			});
			expect(res.status).toBe(200);
			expect(res.headers.get('cache-control')).toContain('private');
			expect(res.headers.get('content-disposition')).toContain('inline; filename=');
		});

		it('restricts /api/security/audit-summary to warden role and blocks students with 403', async () => {
			const { cookie: studentCookie } = await login(app, 'student@example.test', 'student123');
			const { cookie: wardenCookie } = await login(app, 'warden@example.test', 'warden123');

			// Student should be blocked
			const studentRes = await app.request('/api/security/audit-summary', {
				headers: { Cookie: studentCookie }
			});
			expect(studentRes.status).toBe(403);

			// Warden should be allowed
			const wardenRes = await app.request('/api/security/audit-summary', {
				headers: { Cookie: wardenCookie }
			});
			expect(wardenRes.status).toBe(200);
			const json = await wardenRes.json();
			expect(json.security.status).toBe('operational');
			expect(json.security.activeSessions).toBeGreaterThanOrEqual(1);
		});

		it('attaches cryptographic sha256 ETag to attachment responses', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/attachments/att-1', {
				headers: { Cookie: cookie }
			});
			expect(res.status).toBe(200);
			const etag = res.headers.get('etag');
			expect(etag).toBeDefined();
			expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
		});

		it('rejects malformed identifier injection payloads with safe 404', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances/GRV-0001%20OR%201=1', {
				headers: { Cookie: cookie }
			});
			expect(res.status).toBe(404);
		});

		it('blocks cross-site state-changing requests via Sec-Fetch-Site CSRF defense', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances/GRV-0001/comments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Sec-Fetch-Site': 'cross-site',
					Cookie: cookie
				},
				body: JSON.stringify({ body: 'Malicious CSRF comment' })
			});
			expect(res.status).toBe(403);
			const json = await res.json();
			expect(json.code).toBe('unauthorized');
		});

		it('rejects oversized JSON request payloads with 413 Payload Too Large', async () => {
			const { cookie } = await login(app, 'student@example.test', 'student123');
			const res = await app.request('/api/grievances/GRV-0001/comments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': String(150 * 1024),
					Cookie: cookie
				},
				body: JSON.stringify({ body: 'test' })
			});
			expect(res.status).toBe(413);
			const json = await res.json();
			expect(json.code).toBe('bad_request');
		});
	});
});
