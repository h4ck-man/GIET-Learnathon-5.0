import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { AppEnv } from '../env.ts';
import { requireUser } from '../auth/session.ts';
import { assertCanViewGrievance, findAttachmentRow, requireGrievance } from '../db/queries.ts';
import { readStoredFile } from '../storage/attachments.ts';
import { HttpError } from '../http/errors.ts';

export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.get('/:id', (c) => {
	const db = c.get('db');
	const user = requireUser(c, db);
	const row = findAttachmentRow(db, c.req.param('id'));
	if (!row) {
		throw new HttpError(404, 'not_found', 'Attachment was not found.');
	}
	const grievance = requireGrievance(db, row.grievance_id);
	assertCanViewGrievance(user, grievance);

	const bytes = readStoredFile(c.get('uploadsDir'), row.stored_filename);
	const sha256 = createHash('sha256').update(bytes).digest('hex');

	c.header('Content-Type', row.mime_type);
	c.header('Content-Length', String(bytes.length));
	c.header('ETag', `"${sha256}"`);
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('Content-Security-Policy', "default-src 'none'; sandbox");
	c.header('Cache-Control', 'private, no-transform, max-age=86400');
	const sanitizedFilename = row.original_filename.replace(/[\r\n"\\]/g, '').trim() || 'attachment';
	c.header('Content-Disposition', `inline; filename="${sanitizedFilename}"`);
	return c.body(new Uint8Array(bytes));
});
