import { Router } from 'express';
import { query } from '../db';
import { ok } from '../utils/http';

export const commonRouter = Router();
commonRouter.get('/health', (_req, res) => ok(res, { status: 'ok', service: 'vayil-backend', timestamp: new Date().toISOString() }));
commonRouter.get('/service-categories', async (_req, res, next) => {
  try { ok(res, { categories: await query('SELECT * FROM service_categories WHERE status = 1 ORDER BY name ASC') }); } catch (err) { next(err); }
});
commonRouter.get('/service-subcategories', async (req, res, next) => {
  try { ok(res, { subcategories: await query('SELECT * FROM service_subcategories WHERE (:categoryId IS NULL OR category_id = :categoryId) AND status = 1 ORDER BY name ASC', { categoryId: req.query.categoryId || null }) }); } catch (err) { next(err); }
});
commonRouter.get('/service-tags', async (_req, res, next) => {
  try { ok(res, { tags: await query('SELECT * FROM service_tags WHERE status = 1 ORDER BY name ASC') }); } catch (err) { next(err); }
});
commonRouter.get('/settings', async (_req, res, next) => {
  try { ok(res, { settings: await query('SELECT * FROM settings LIMIT 1') }); } catch (err) { next(err); }
});
