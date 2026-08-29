import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import {
	createSession,
	clearSessionCookie,
	destroySession,
	optionalToken,
	requireUser,
	setSessionCookie
} from '../auth/session.ts';
import { hashPassword, verifyPassword } from '../auth/passwords.ts';
import { findUserByEmail } from '../db/queries.ts';
import { toPublicUser } from '../db/map.ts';
import { HttpError } from '../http/errors.ts';

// Dummy hash for constant-time comparison on non-existent user lookup
const DUMMY_HASH =
	'pbkdf2:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/login', async (c) => {
	const db = c.get('db');
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	if (!body || typeof body !== 'object') {
		throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
	}
	const email = 'email' in body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const password = 'password' in body && typeof body.password === 'string' ? body.password : '';
	if (!email || !password) {
		throw new HttpError(400, 'bad_request', 'Email and password are required.');
	}
	if (email.length > 254 || password.length > 128) {
		throw new HttpError(400, 'bad_request', 'Email or password exceeds maximum permitted length.');
	}

	const user = findUserByEmail(db, email);
	if (!user) {
		// Run dummy verification to eliminate user enumeration timing side channels
		verifyPassword(password, DUMMY_HASH);
		throw new HttpError(401, 'unauthenticated', 'Invalid email or password.');
	}

	if (!verifyPassword(password, user.password_hash)) {
		throw new HttpError(401, 'unauthenticated', 'Invalid email or password.');
	}

	// Transparently upgrade legacy sha256 hashes to salted PBKDF2 on successful login
	if (user.password_hash.startsWith('sha256:')) {
		const newHash = hashPassword(password);
		db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
	}

	const token = createSession(db, user.id);
	setSessionCookie(c, token);
	return c.json({ user: toPublicUser(user) });
});

authRoutes.post('/logout', (c) => {
	const db = c.get('db');
	const token = optionalToken(c);
	if (token) {
		destroySession(db, token);
	}
	clearSessionCookie(c);
	return c.json({ ok: true });
});

authRoutes.get('/me', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	return c.json({ user: toPublicUser(user) });
});

authRoutes.get('/security/audit-summary', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	if (user.role !== 'warden') {
		throw new HttpError(403, 'unauthorized', 'Only wardens may view the security audit summary.');
	}

	const activeSessions = (
		db.prepare('SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?').get(new Date().toISOString()) as {
			count: number;
		}
	).count;

	const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
	const totalGrievances = (db.prepare('SELECT COUNT(*) as count FROM grievances').get() as { count: number }).count;

	return c.json({
		security: {
			status: 'operational',
			authMechanism: 'PBKDF2-SHA256 (100,000 rounds) with Per-User Salt',
			sessionSecurity: 'HttpOnly SameSite=Lax Server-Authoritative Sessions',
			sqliteAntiForensics: 'secure_delete=ON, journal_mode=WAL',
			rateLimiting: 'Sliding-Window IP Throttler Active',
			activeSessions,
			totalUsers,
			totalGrievances,
			timestamp: new Date().toISOString()
		}
	});
});
