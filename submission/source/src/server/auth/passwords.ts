import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
	return `pbkdf2:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const parts = stored.split(':');
	if (parts.length === 2) {
		const [scheme, hash] = parts;
		if (scheme !== 'sha256' || !hash) return false;
		const actual = createHash('sha256').update(password).digest();
		const expected = Buffer.from(hash, 'hex');
		if (actual.length !== expected.length) return false;
		return timingSafeEqual(actual, expected);
	}
	if (parts.length === 3) {
		const [scheme, salt, hash] = parts;
		if (scheme !== 'pbkdf2' || !salt || !hash) return false;
		const actual = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
		const expected = Buffer.from(hash, 'hex');
		if (actual.length !== expected.length) return false;
		return timingSafeEqual(actual, expected);
	}
	return false;
}
