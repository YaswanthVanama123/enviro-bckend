/**
 * Map Distance Routes
 * Routes for map distance functionality
 */

import express from 'express';
import { getRouteStarCustomers, fetchMapDistance } from '../controllers/mapDistanceController.js';

const router = express.Router();

// GET /api/map-distance/customers - Get all RouteStar customers for dropdown
router.get('/customers', getRouteStarCustomers);

// POST /api/map-distance/fetch - Fetch map distance for a customer
router.post('/fetch', fetchMapDistance);

export default router;
