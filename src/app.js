// src/app.js
import express from 'express';
import cors from 'cors';
import compression from "compression";
import morgan from 'morgan';
import proposalRoutes from './routes/proposalRoutes.js';
import priceFixRoutes from "./routes/priceFixRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import { PDF_MAX_BODY_MB } from "./config/pdfConfig.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import productCatalogRoutes from './routes/productCatalogRoutes.js';
// import { ensureDefaultAdmin } from "./models/AdminUser.js";

const app = express();
app.use(cors());
app.use(compression({ threshold: 0 }));
app.use(morgan('dev'));
app.use(express.json({ limit: `${PDF_MAX_BODY_MB}mb` }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/proposals', proposalRoutes);
// app.use("/api/prices",    priceFixRoutes);
app.use("/api/pdf",       pdfRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/pricefix", priceFixRoutes);
app.use("/api/product-catalog", productCatalogRoutes);

export default app;
