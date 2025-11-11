// src/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import proposalRoutes from './routes/proposalRoutes.js';
import priceFixRoutes from "./routes/priceFixRoutes.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/proposals', proposalRoutes);
app.use("/api/prices", priceFixRoutes);

export default app;
 