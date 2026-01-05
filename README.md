# EnviroMaster Backend API

[![Deploy to Digital Ocean](https://github.com/YaswanthVanama123/enviro-bckend/actions/workflows/deploy.yml/badge.svg)](https://github.com/YaswanthVanama123/enviro-bckend/actions/workflows/deploy.yml)
[![Production Status](https://img.shields.io/badge/production-ready-brightgreen)]()
[![Node.js Version](https://img.shields.io/badge/node-20.x-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## 🚀 Production-Ready Backend with Auto-Deploy CI/CD

This backend automatically deploys to **Digital Ocean** when you push to the `main` branch.

---

## 📦 What's Inside

✅ **Automatic Deployment** - Push to main, deploy in 5 minutes
✅ **Docker Containerization** - Consistent environments
✅ **PM2 Process Management** - Auto-restart, clustering, monitoring
✅ **Health Checks** - Built-in monitoring endpoints
✅ **Production Security** - Helmet, CORS, rate limiting
✅ **Optimized Performance** - Compression, caching, connection pooling

---

## 🎯 Quick Start

### Option 1: Deploy to Digital Ocean App Platform (Recommended)

```bash
# 1. Install Digital Ocean CLI
brew install doctl

# 2. Create container registry
doctl registry create enviro-registry

# 3. Configure GitHub Secrets (see QUICK_START_DEPLOYMENT.md)

# 4. Push to main branch
git push origin main
```

**Time to deploy:** 5-10 minutes
**Cost:** $10/month (Basic plan, 2 instances)

See **[Quick Start Guide](./QUICK_START_DEPLOYMENT.md)** for detailed steps.

### Option 2: Deploy to Droplet

See **[Full Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)** for manual droplet setup.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Quick Start](./QUICK_START_DEPLOYMENT.md) | 5-minute setup guide |
| [Full Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md) | Complete deployment documentation |
| [API Endpoints](./API_DOCUMENTATION.md) | API reference (if available) |
| [Environment Variables](./.env.example) | Configuration reference |

---

## 🛠 Development

### Prerequisites

- Node.js 20+
- MongoDB 6+
- npm or yarn

### Local Setup

```bash
# Clone repository
git clone https://github.com/YaswanthVanama123/enviro-bckend.git
cd enviro-bckend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

Server runs at: `http://localhost:5000`

### Available Scripts

```bash
npm run dev          # Start development server with nodemon
npm run start        # Start production server
npm run start:prod   # Start with NODE_ENV=production
npm run start:pm2    # Start with PM2 (production)
npm run logs:pm2     # View PM2 logs
npm run build:docker # Build Docker image
npm run run:docker   # Run Docker container
```

---

## 🏗 Architecture

```
enviro-bckend/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
├── .do/
│   └── app.yaml                # Digital Ocean App spec
├── src/
│   ├── config/                 # Configuration files
│   ├── controllers/            # Request handlers
│   ├── models/                 # Database models
│   ├── routes/                 # API routes
│   ├── services/               # Business logic
│   ├── utils/                  # Utilities
│   ├── app.js                  # Express app setup
│   └── server.js               # Server entry point
├── Dockerfile                  # Docker configuration
├── ecosystem.config.cjs        # PM2 configuration
└── server.js                   # Application entry point
```

---

## 🔐 Environment Variables

Required environment variables (see `.env.example`):

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
ZOHO_CLIENT_ID=your-zoho-client-id
ZOHO_CLIENT_SECRET=your-zoho-client-secret
EMAIL_USER=your-email@gmail.com
ALLOWED_ORIGINS=https://yourdomain.com
```

---

## 🚦 Health Check

The API includes a comprehensive health check endpoint:

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-05T12:00:00.000Z",
  "uptime": 123.45,
  "environment": "production",
  "database": {
    "status": "connected"
  },
  "memory": {
    "rss": "150MB",
    "heapUsed": "75MB"
  }
}
```

---

## 📊 Monitoring

### Production Monitoring

**App Platform:**
```bash
# View logs
doctl apps logs <app-id> --follow

# View metrics
doctl apps get <app-id>
```

**Droplet with PM2:**
```bash
# View logs
pm2 logs enviro-backend

# Monitor resources
pm2 monit

# View status
pm2 status
```

---

## 🔄 CI/CD Pipeline

The GitHub Actions workflow automatically:

1. ✅ Runs syntax checks
2. ✅ Builds Docker image
3. ✅ Pushes to Digital Ocean Container Registry
4. ✅ Deploys to App Platform or Droplet
5. ✅ Runs health checks
6. ✅ Notifies deployment status

**Trigger:** Push to `main` branch
**Duration:** ~5-7 minutes
**Status:** Check Actions tab

---

## 🛡 Security

- ✅ Helmet.js for security headers
- ✅ CORS configured for production
- ✅ Environment variables for secrets
- ✅ JWT authentication
- ✅ Input validation
- ✅ Non-root Docker user
- ✅ Read-only file system

---

## 📈 Performance

- ✅ Response compression
- ✅ In-memory caching (5-minute TTL)
- ✅ Request deduplication
- ✅ Database connection pooling
- ✅ PM2 cluster mode (2 instances)
- ✅ Optimized Docker layers

**Benchmarks:**
- Health check: ~10-20ms
- API endpoints: ~50-200ms
- Cached responses: ~1-5ms

---

## 💰 Pricing

### App Platform (Recommended)
```
Basic Plan: $10/month (2 instances)
+ MongoDB Atlas M0: Free
+ Container Registry: Free (500MB)
---------------------------------
Total: $10/month
```

### Droplet (Budget)
```
Droplet (2GB): $12/month
+ MongoDB Atlas M0: Free
---------------------------------
Total: $12/month
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the MIT License.

---

## 🆘 Support

- **Documentation:** See [Full Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- **Issues:** [GitHub Issues](https://github.com/YaswanthVanama123/enviro-bckend/issues)
- **Digital Ocean:** [Community Docs](https://docs.digitalocean.com)

---

## 📌 Quick Links

- [Quick Start Guide](./QUICK_START_DEPLOYMENT.md) - Get started in 5 minutes
- [Full Deployment Guide](./PRODUCTION_DEPLOYMENT_GUIDE.md) - Comprehensive documentation
- [Environment Variables](./.env.example) - Configuration reference
- [CI/CD Workflow](./.github/workflows/deploy.yml) - Automation details

---

**Last Updated:** January 5, 2025
**Version:** 1.0.0
**Status:** Production Ready ✅
