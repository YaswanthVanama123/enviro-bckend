import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from "compression";
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
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
import serviceAgreementTemplateRoutes from './routes/serviceAgreementTemplateRoutes.js';
import adminSettingsRoutes from './routes/adminSettingsRoutes.js';


const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../uploads/service-images');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (process.env.NODE_ENV === 'production') {
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
      }
    } else {
      callback(null, true);
    }
  },
  credentials: true,
  exposedHeaders: ['X-CustomerHeaderDoc-Id', 'X-AdminHeaderDoc-Id', 'Content-Disposition']
};

app.use(cors(corsOptions));
app.use(compression({ threshold: 0 }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(express.json({ limit: `${PDF_MAX_BODY_MB}mb` }));

app.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    service: 'enviro-backend',
    version: process.env.npm_package_version || '1.0.0'
  };

  try {
    const mongoose = await import('mongoose');
    if (mongoose.default.connection.readyState === 1) {
      healthCheck.database = {
        status: 'connected',
        name: mongoose.default.connection.name
      };
    } else {
      healthCheck.database = {
        status: 'disconnected',
        message: 'Database connection not ready'
      };
      healthCheck.status = 'degraded';
    }
  } catch (error) {
    healthCheck.database = {
      status: 'error',
      message: error.message
    };
    healthCheck.status = 'degraded';
  }

  const memUsage = process.memoryUsage();
  healthCheck.memory = {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
  };

  healthCheck.cpu = {
    usage: process.cpuUsage()
  };

  healthCheck.responseTime = `${Date.now() - req._startTime}ms`;

  const httpStatus = healthCheck.status === 'ok' ? 200 : 503;

  res.status(httpStatus).json(healthCheck);
});

app.use((req, _res, next) => {
  req._startTime = Date.now();
  next();
});


app.use('/api/proposals', proposalRoutes);
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
app.use("/api/service-agreement-template", serviceAgreementTemplateRoutes);
app.use("/api/admin-settings", adminSettingsRoutes);

export default app;
