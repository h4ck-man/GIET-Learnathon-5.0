import type { Context, MiddlewareHandler } from 'hono';
import { HttpError } from './errors.ts';

interface RateLimitRecord {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateLimitRecord>();

// Cleanup stale rate limit entries periodically
setInterval(() => {
	const now = Date.now();
	for (const [key, record] of store.entries()) {
		if (record.resetAt <= now) {
			store.delete(key);
		}
	}
}, 60000).unref();

export function createRateLimiter(options: {
	windowMs: number;
	max: number;
	message?: string;
	keyGenerator?: (c: Context) => string;
}): MiddlewareHandler {
	const {
		windowMs,
		max,
		message = 'Too many requests, please try again later.',
		keyGenerator = (c) => {
			const forwarded = c.req.header('x-forwarded-for');
			const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
			return `${c.req.path}:${ip}`;
		}
	} = options;

	return async (c, next) => {
		// Bypass rate limiting in test environment unless specifically tested
		if (process.env.NODE_ENV === 'test' && !c.req.header('x-test-rate-limit')) {
			await next();
			return;
		}

		const key = keyGenerator(c);
		const now = Date.now();
		let record = store.get(key);

		if (!record || record.resetAt <= now) {
			record = { count: 1, resetAt: now + windowMs };
			store.set(key, record);
		} else {
			record.count += 1;
		}

		const remaining = Math.max(0, max - record.count);
		const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

		c.header('X-RateLimit-Limit', String(max));
		c.header('X-RateLimit-Remaining', String(remaining));
		c.header('X-RateLimit-Reset', String(resetSeconds));

		if (record.count > max) {
			c.header('Retry-After', String(resetSeconds));
			throw new HttpError(429, 'bad_request', message);
		}

		await next();
	};
}
