import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '../config.ts';
import { HttpError } from '../http/errors.ts';

const MIME_EXTENSION: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/gif': '.gif',
	'image/webp': '.webp'
};

export function ensureUploadsDir(dir: string): void {
	mkdirSync(dir, { recursive: true });
}

export function resetUploadsDir(dir: string): void {
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
	mkdirSync(dir, { recursive: true });
}

export function originalBasename(filename: string): string {
	const base = filename.replace(/\\/g, '/').split('/').pop() ?? 'upload';
	const cleaned = base.replace(/[\0\r\n]/g, '').trim();
	return cleaned.length > 0 ? cleaned.slice(0, 255) : 'upload';
}

export function extensionForMime(mime: string): string {
	return MIME_EXTENSION[mime] ?? '.bin';
}

export function newStoredName(mime: string, _originalName?: string): string {
	return `${randomBytes(16).toString('hex')}${extensionForMime(mime)}`;
}

export function verifyMagicBytes(mime: string, bytes: Buffer): boolean {
	if (bytes.length < 12) return false;
	switch (mime) {
		case 'image/jpeg':
			return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
		case 'image/png':
			return (
				bytes[0] === 0x89 &&
				bytes[1] === 0x50 &&
				bytes[2] === 0x4e &&
				bytes[3] === 0x47 &&
				bytes[4] === 0x0d &&
				bytes[5] === 0x0a &&
				bytes[6] === 0x1a &&
				bytes[7] === 0x0a
			);
		case 'image/gif': {
			const header = bytes.subarray(0, 6).toString('ascii');
			return header === 'GIF87a' || header === 'GIF89a';
		}
		case 'image/webp': {
			const riff = bytes.subarray(0, 4).toString('ascii');
			const webp = bytes.subarray(8, 12).toString('ascii');
			return riff === 'RIFF' && webp === 'WEBP';
		}
		default:
			return false;
	}
}

export function assertPermittedAttachment(mime: string, size: number, bytes?: Buffer): void {
	if (!ALLOWED_ATTACHMENT_TYPES.has(mime)) {
		throw new HttpError(400, 'bad_request', 'Attachments must be JPEG, PNG, GIF, or WebP images.');
	}
	if (size <= 0) {
		throw new HttpError(400, 'bad_request', 'Attachment file is empty.');
	}
	if (size > MAX_ATTACHMENT_BYTES) {
		throw new HttpError(400, 'bad_request', 'Attachment must be 2 MB or smaller.');
	}
	if (bytes && !verifyMagicBytes(mime, bytes)) {
		throw new HttpError(400, 'bad_request', 'File content does not match the declared image type.');
	}
}

export async function bufferFromUpload(file: File): Promise<Buffer> {
	const bytes = Buffer.from(await file.arrayBuffer());
	assertPermittedAttachment(file.type, bytes.byteLength, bytes);
	return bytes;
}

export function writeStoredFile(uploadsDir: string, storedName: string, bytes: Buffer): void {
	if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
		throw new HttpError(400, 'bad_request', 'Invalid attachment filename.');
	}
	ensureUploadsDir(uploadsDir);
	const root = resolve(uploadsDir);
	const full = resolve(join(uploadsDir, storedName));
	if (full !== root && !full.startsWith(root + sep)) {
		throw new HttpError(400, 'bad_request', 'Invalid attachment destination.');
	}
	writeFileSync(full, bytes);
}

export function readStoredFile(uploadsDir: string, storedName: string): Buffer {
	if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	const root = resolve(uploadsDir);
	const full = resolve(join(uploadsDir, storedName));
	if (full !== root && !full.startsWith(root + sep)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	if (!existsSync(full)) {
		throw new HttpError(404, 'not_found', 'Attachment file was not found.');
	}
	return readFileSync(full);
}

export function listStoredNames(uploadsDir: string): string[] {
	if (!existsSync(uploadsDir)) return [];
	return readdirSync(uploadsDir).filter((name) => name !== '.gitkeep');
}
