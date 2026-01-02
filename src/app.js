// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from "compression";
import morgan from 'morgan';
import proposalRoutes from './routes/proposalRoutes.js';
import priceFixRoutes from "./routes/priceFixRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import { PDF_MAX_BODY_MB } from "./config/pdfConfig.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import productCatalogRoutes from './routes/productCatalogRoutes.js';
import serviceConfigRoutes from './routes/serviceConfigRoutes.js';
import manualUploadRoutes from './routes/manualUploadRoutes.js';
import oauthRoutes from './routes/oauthRoutes.js';
import zohoUploadRoutes from './routes/zohoUploadRoutes.js';
import versionRoutes from './routes/versionRoutes.js';
import pricingBackupRoutes from './routes/pricingBackupRoutes.js';
import versionLogRoutes from './routes/pdf/versionLogs.js';
import emailRoutes from './routes/emailRoutes.js';
import emailTemplateRoutes from './routes/emailTemplateRoutes.js';


// import { ensureDefaultAdmin } from "./models/AdminUser.js";

const app = express();

// ✅ PRODUCTION: Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Disable if you need to load external resources
  crossOriginEmbedderPolicy: false, // Disable if needed for CORS
}));

// ✅ PRODUCTION: Configure CORS with environment-based origin restrictions
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173']; // Default for development

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In production, strictly enforce allowed origins
    if (process.env.NODE_ENV === 'production') {
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
      }
    } else {
      // In development, allow all origins
      callback(null, true);
    }
  },
  credentials: true,
  exposedHeaders: ['X-CustomerHeaderDoc-Id', 'X-AdminHeaderDoc-Id', 'Content-Disposition']
};

app.use(cors(corsOptions));
app.use(compression({ threshold: 0 }));

// ✅ PRODUCTION: Only log HTTP requests in development mode
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: `${PDF_MAX_BODY_MB}mb` }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/proposals', proposalRoutes);
// app.use("/api/prices",    priceFixRoutes);
app.use("/api/pdf",       pdfRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/pricefix", priceFixRoutes);
app.use("/api/product-catalog", productCatalogRoutes);
app.use("/api/service-configs", serviceConfigRoutes);
app.use("/api/manual-upload", manualUploadRoutes);
app.use("/oauth", oauthRoutes);
app.use("/api/zoho-upload", zohoUploadRoutes);
app.use("/api/versions", versionRoutes);
app.use("/api/pricing-backup", pricingBackupRoutes);
app.use("/api/pdf/version-logs", versionLogRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/email-template", emailTemplateRoutes);

export default app;
 