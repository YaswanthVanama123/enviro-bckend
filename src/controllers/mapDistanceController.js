/**
 * Map Distance Controller
 * Handles API endpoints for map distance functionality
 */

import { getMapDistance } from '../services/mapDistanceScraper.js';
import RouteStarCustomer from '../models/RouteStarCustomer.js';

/**
 * GET /api/map-distance/customers
 * Get all RouteStar customers for dropdown selection
 */
export const getRouteStarCustomers = async (req, res) => {
  try {
    const { search } = req.query;

    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await RouteStarCustomer.find(query)
      .select('routeStarId name company city state')
      .sort({ name: 1 })
      .limit(500)
      .lean();

    res.json({
      success: true,
      data: customers,
      total: customers.length
    });
  } catch (error) {
    console.error('Error fetching RouteStar customers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch customers'
    });
  }
};

/**
 * POST /api/map-distance/fetch
 * Fetch map distance for a customer by automating RouteStar
 */
export const fetchMapDistance = async (req, res) => {
  try {
    const { customerName } = req.body;

    if (!customerName) {
      return res.status(400).json({
        success: false,
        error: 'Customer name is required'
      });
    }

    console.log(`[MapDistance] Fetching distance for: ${customerName}`);

    const result = await getMapDistance(customerName, (progress, message) => {
      console.log(`[MapDistance] ${progress}% - ${message}`);
    });

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        customerName: result.customerName,
        fetchedAt: result.fetchedAt
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch map distance',
        customerName: result.customerName
      });
    }
  } catch (error) {
    console.error('Error fetching map distance:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch map distance'
    });
  }
};

export default {
  getRouteStarCustomers,
  fetchMapDistance
};
