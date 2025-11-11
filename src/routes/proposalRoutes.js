// src/routes/proposalRoutes.js
import express from 'express';
import {
  createProposal,
  updateProposal,
  getProposalById,
  listProposals,
  getFormCatalog,
  attachPdfAndMarkForZoho,
} from '../controllers/proposalController.js';

const router = express.Router();

// UI bootstrapping data for dynamic form (replace your dummy JSON)
router.get('/catalog', getFormCatalog);

// CRUD for proposals
router.get('/', listProposals);
router.get('/:id', getProposalById);
router.post('/', createProposal);
router.put('/:id', updateProposal);

// attach generated PDF + mark for Zoho sync
router.post('/:id/pdf', attachPdfAndMarkForZoho);

export default router;
