import { Hono } from 'hono';
import type { Database } from 'better-sqlite3';
import type { AppEnv } from './env.ts';
import { handleError, HttpError } from './http/errors.ts';
import { authRoutes } from './routes/auth.ts';
import { grievanceRoutes } from './routes/grievances.ts';
import { attachmentRoutes } from './routes/attachments.ts';
import { cors } from 'hono/cors';
import { createRateLimiter } from './http/rate-limit.ts';

export type CreateAppOptions = {
	db: Database;
	uploadsDir: string;
};

function isAllowedOrigin(origin: string | undefined): string | null {
	if (!origin) return null;
	try {
		const parsed = new URL(origin);
		const host = parsed.hostname;
		// Allow localhost and 127.0.0.1 on any port for local development
		if (host === 'localhost' || host === '127.0.0.1') {
			return origin;
		}
		// In production, check against configured whitelist
		if (process.env.ALLOWED_ORIGINS) {
			const allowed = process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
			if (allowed.includes(origin)) return origin;
		}
	} catch {
		return null;
	}
	return null;
}

export function createApp(options: CreateAppOptions) {
	const app = new Hono<AppEnv>();

	// Security Headers Middleware
	app.use('*', async (c, next) => {
		c.set('db', options.db);
		c.set('uploadsDir', options.uploadsDir);
		c.header('X-Content-Type-Options', 'nosniff');
		c.header('X-Frame-Options', 'DENY');
		c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
		c.header('Cross-Origin-Opener-Policy', 'same-origin');
		c.header('Cross-Origin-Resource-Policy', 'same-site');
		c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
		c.header(
			'Content-Security-Policy',
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
		);
		await next();
	});

	// Strict CORS Middleware
	app.use(
		'/api/*',
		cors({
			origin: (origin) => isAllowedOrigin(origin) ?? '',
			credentials: true,
			allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
			allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
			exposeHeaders: ['Content-Length', 'ETag', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
		})
	);

	// Anti-CSRF and Content-Type validation middleware
	app.use('/api/*', async (c, next) => {
		const method = c.req.method.toUpperCase();
		if (method === 'POST' || method === 'PATCH') {
			// Sec-Fetch-Site guard against cross-site forged requests from other websites
			const secFetchSite = c.req.header('sec-fetch-site');
			if (secFetchSite === 'cross-site') {
				throw new HttpError(403, 'unauthorized', 'Cross-site request blocked by security policy.');
			}

			// Validate Content-Length to prevent memory exhaustion / JSON bombs (max 100KB for API calls)
			const contentLength = Number.parseInt(c.req.header('content-length') || '0', 10);
			const path = c.req.path;
			// File uploads on /api/grievances have their own 2MB multipart limit
			if (contentLength > 100 * 1024 && !path.endsWith('/grievances')) {
				throw new HttpError(413, 'bad_request', 'Request payload exceeds maximum allowed size of 100 KB.');
			}
		}
		await next();
	});

	app.onError((err, c) => handleError(err, c));

	app.notFound((c) => c.json({ error: 'Not found.', code: 'not_found' }, 404));

	// Rate limiting on sensitive endpoints
	const loginLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 20, message: 'Too many login attempts. Please try again later.' });
	const grievanceLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 30, message: 'Too many grievance submissions. Please try again later.' });

	app.post('/api/login', loginLimiter);
	app.post('/api/grievances', grievanceLimiter);

	app.get('/api/health', (c) => c.json({ ok: true }));
	app.route('/api', authRoutes);
	app.route('/api/grievances', grievanceRoutes);
	app.route('/api/attachments', attachmentRoutes);

	app.all('/api/*', () => {
		throw new HttpError(404, 'not_found', 'Not found.');
	});

	return app;
}
