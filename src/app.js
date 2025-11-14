// src/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import proposalRoutes from './routes/proposalRoutes.js';
import priceFixRoutes from "./routes/priceFixRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import { PDF_MAX_BODY_MB } from "./config/pdfConfig.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(express.json({ limit: `${PDF_MAX_BODY_MB}mb` }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/proposals', proposalRoutes);
app.use("/api/prices", priceFixRoutes);
app.use("/api/pdf", pdfRoutes);

export default app;
 