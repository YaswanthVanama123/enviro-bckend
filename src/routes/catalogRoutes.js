import { Router } from 'express';
import { getCatalog, updateCatalog } from '../controllers/catalogController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const r = Router();

r.get('/', getCatalog);                  // GET /api/catalog?key=default
r.put('/', requireAdmin, updateCatalog); // PUT /api/catalog  (admin only)

export default r;
