# EnviroMaster Backend - Production Deployment Guide

## 🚀 Overview

This guide covers deploying the EnviroMaster backend to Digital Ocean with automatic CI/CD deployment from the `main` branch using GitHub Actions.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Deployment Options](#deployment-options)
3. [Option A: Digital Ocean App Platform (Recommended)](#option-a-digital-ocean-app-platform)
4. [Option B: Digital Ocean Droplet with PM2](#option-b-digital-ocean-droplet)
5. [GitHub Secrets Configuration](#github-secrets-configuration)
6. [Environment Variables](#environment-variables)
7. [Post-Deployment](#post-deployment)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts
- ✅ GitHub account with repository access
- ✅ Digital Ocean account ([Sign up](https://cloud.digitalocean.com/registrations/new))
- ✅ MongoDB Atlas account (or Digital Ocean Managed MongoDB)

### Required Tools (for local development)
```bash
# Install Docker (optional, for local testing)
brew install docker # macOS
# OR
sudo apt install docker.io # Ubuntu

# Install Digital Ocean CLI (optional)
brew install doctl # macOS
# OR
snap install doctl # Ubuntu
```

---

## Deployment Options

### Option A: App Platform (Recommended) ✅
**Pros:**
- Fully managed (no server maintenance)
- Auto-scaling
- Built-in SSL certificates
- Automatic health checks
- $10-20/month for basic setup

**Cons:**
- Slightly more expensive than droplet
- Less control over infrastructure

### Option B: Droplet with PM2
**Pros:**
- More control
- Cheaper ($6-12/month)
- Can run multiple apps on same droplet

**Cons:**
- Manual server maintenance
- Need to configure SSL manually
- More complex setup

---

## Option A: Digital Ocean App Platform

### Step 1: Create Digital Ocean Container Registry

```bash
# Login to Digital Ocean
doctl auth init

# Create container registry
doctl registry create enviro-registry

# Get registry name (you'll need this for GitHub secrets)
doctl registry get
```

### Step 2: Create App Platform Application

**Via Dashboard:**

1. Go to [Digital Ocean Apps](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Select "GitHub" as source
4. Authorize Digital Ocean to access your repo
5. Select repository: `YaswanthVanama123/enviro-bckend`
6. Select branch: `main`
7. Choose "Dockerfile" for build
8. Select **Basic (Basic - $5/mo per container)**
9. Set instances to **2** for high availability
10. Click "Next" to configure environment variables

**Via CLI:**

```bash
# Create app from spec file
doctl apps create --spec .do/app.yaml

# Get app ID (you'll need this for GitHub secrets)
doctl apps list
```

### Step 3: Configure Environment Variables

In the App Platform dashboard:

1. Go to your app → Settings → App-Level Environment Variables
2. Add the following variables:

```bash
# Required Variables
NODE_ENV=production
PORT=5000
MONGODB_URI=<your-mongodb-connection-string>
JWT_SECRET=<generate-strong-secret>

# Zoho OAuth (from your Zoho console)
ZOHO_CLIENT_ID=<your-zoho-client-id>
ZOHO_CLIENT_SECRET=<your-zoho-client-secret>
ZOHO_REFRESH_TOKEN=<your-zoho-refresh-token>
ZOHO_ACCOUNTS_BASE=https://accounts.zoho.com
ZOHO_BIGIN_API_VERSION=v2

# Email Configuration
EMAIL_USER=<your-email@domain.com>
EMAIL_PASSWORD=<your-email-app-password>
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587

# CORS Configuration
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://your-app.com

# PDF Configuration
PDF_MAX_BODY_MB=50
PDF_MAX_HEADER_DOC_MB=10

# Frontend URL (for email links)
FRONTEND_URL=https://your-frontend-domain.com
```

### Step 4: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

```bash
DIGITALOCEAN_ACCESS_TOKEN=<your-do-personal-access-token>
DIGITALOCEAN_REGISTRY_NAME=enviro-registry
DIGITALOCEAN_APP_ID=<your-app-id-from-step-2>
```

To generate Digital Ocean access token:
1. Go to [API Tokens](https://cloud.digitalocean.com/account/api/tokens)
2. Click "Generate New Token"
3. Name: "GitHub Actions CI/CD"
4. Scopes: **Read & Write**
5. Copy the token (you won't see it again!)

### Step 5: Add Repository Variable

Go to your GitHub repository → Settings → Secrets and variables → Actions → Variables tab

Add this variable:

```bash
USE_APP_PLATFORM=true
```

### Step 6: Deploy!

Simply push to the `main` branch:

```bash
git add .
git commit -m "feat: setup production deployment"
git push origin main
```

The GitHub Action will automatically:
1. ✅ Run tests
2. ✅ Build Docker image
3. ✅ Push to Digital Ocean Container Registry
4. ✅ Deploy to App Platform
5. ✅ Run health check

Monitor the deployment:
- GitHub: Actions tab
- Digital Ocean: Apps → Your App → Activity

---

## Option B: Digital Ocean Droplet

### Step 1: Create Droplet

```bash
# Via CLI
doctl compute droplet create enviro-backend \
  --region nyc1 \
  --size s-1vcpu-2gb \
  --image ubuntu-22-04-x64 \
  --ssh-keys <your-ssh-key-id>

# Get droplet IP
doctl compute droplet list
```

**Via Dashboard:**
1. Go to [Create Droplet](https://cloud.digitalocean.com/droplets/new)
2. Choose **Ubuntu 22.04 LTS**
3. Select **Basic plan** ($12/mo - 2GB RAM, 1 vCPU)
4. Add your SSH key
5. Create droplet

### Step 2: Initial Server Setup

SSH into your droplet:

```bash
ssh root@<your-droplet-ip>

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 globally
npm install -g pm2

# Create application directory
mkdir -p /var/www/enviro-backend
cd /var/www/enviro-backend

# Clone repository
git clone https://github.com/YaswanthVanama123/enviro-bckend.git .

# Install dependencies
npm ci --production

# Create .env file
nano .env
# Paste your environment variables (same as Option A)
# Save and exit (Ctrl+X, Y, Enter)

# Start with PM2
npm run start:pm2

# Configure PM2 to start on boot
pm2 startup
pm2 save

# Configure firewall
ufw allow OpenSSH
ufw allow 5000
ufw enable
```

### Step 3: Configure GitHub Secrets for Droplet

Add these secrets to GitHub repository:

```bash
DROPLET_HOST=<your-droplet-ip>
DROPLET_USERNAME=root
DROPLET_SSH_KEY=<your-private-ssh-key-content>
DROPLET_PORT=22
```

### Step 4: Add Repository Variable

```bash
# Do NOT set USE_APP_PLATFORM variable
# Or set it to false
USE_APP_PLATFORM=false
```

### Step 5: Deploy!

Push to main branch:

```bash
git push origin main
```

The GitHub Action will automatically SSH into your droplet and:
1. ✅ Pull latest code
2. ✅ Install dependencies
3. ✅ Restart PM2 process
4. ✅ Run health check

---

## GitHub Secrets Configuration

### Required Secrets

| Secret Name | Description | Example |
|------------|-------------|---------|
| `DIGITALOCEAN_ACCESS_TOKEN` | DO API token | `dop_v1_xxxxx` |
| `DIGITALOCEAN_REGISTRY_NAME` | Container registry name | `enviro-registry` |
| `DIGITALOCEAN_APP_ID` | App Platform app ID | `abc123-def456` |
| `DROPLET_HOST` | Droplet IP address | `167.99.123.45` |
| `DROPLET_USERNAME` | SSH username | `root` |
| `DROPLET_SSH_KEY` | Private SSH key | `-----BEGIN RSA PRIVATE KEY-----...` |
| `DROPLET_PORT` | SSH port | `22` |

### Required Variables

| Variable Name | Value | Purpose |
|--------------|-------|---------|
| `USE_APP_PLATFORM` | `true` or `false` | Choose deployment method |

---

## Environment Variables

### Production Environment Template

Create a `.env.production` file (DO NOT COMMIT):

```bash
# Node Environment
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/enviro?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-characters

# Zoho OAuth
ZOHO_CLIENT_ID=1000.XXXXXXXXXXXXXXXXXXXXXXXXXX
ZOHO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOHO_REFRESH_TOKEN=1000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOHO_ACCOUNTS_BASE=https://accounts.zoho.com
ZOHO_BIGIN_API_VERSION=v2

# Email (Gmail example)
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASSWORD=your-gmail-app-password
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# PDF Configuration
PDF_MAX_BODY_MB=50
PDF_MAX_HEADER_DOC_MB=10

# Frontend URL
FRONTEND_URL=https://yourdomain.com

# Optional: Admin defaults
ADMIN_DEFAULT_EMAIL=admin@yourdomain.com
ADMIN_DEFAULT_PASSWORD=change-this-password
```

---

## Post-Deployment

### 1. Verify Deployment

```bash
# Check health endpoint
curl https://your-app-url.com/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2025-01-05T12:00:00.000Z",
  "uptime": 123.45,
  "environment": "production",
  "service": "enviro-backend",
  "version": "1.0.0",
  "database": {
    "status": "connected",
    "name": "enviro"
  },
  "memory": {
    "rss": "150MB",
    "heapUsed": "75MB",
    "heapTotal": "120MB"
  }
}
```

### 2. Configure Custom Domain (Optional)

**For App Platform:**
```bash
# Via CLI
doctl apps update <app-id> --domain yourdomain.com

# Via Dashboard:
# Apps → Your App → Settings → Domains → Add Domain
```

**For Droplet:**
1. Point your domain's A record to droplet IP
2. Install Nginx and Certbot
3. Configure reverse proxy

### 3. Update Frontend Configuration

Update your frontend `.env.production`:

```bash
VITE_API_BASE_URL=https://your-app-url.com
# or
VITE_API_BASE_URL=https://api.yourdomain.com
```

### 4. Update Zoho Redirect URI

Go to [Zoho API Console](https://api-console.zoho.com):
1. Select your app
2. Update Redirect URI to: `https://your-app-url.com/oauth/callback`
3. Regenerate refresh token

---

## Monitoring & Maintenance

### View Logs

**App Platform:**
```bash
# Via CLI
doctl apps logs <app-id> --follow

# Via Dashboard:
# Apps → Your App → Runtime Logs
```

**Droplet with PM2:**
```bash
# SSH into droplet
ssh root@<droplet-ip>

# View logs
pm2 logs enviro-backend

# Monitor resources
pm2 monit
```

### Performance Monitoring

Monitor these metrics:
- Response time (aim for <200ms)
- Memory usage (should stay under 80%)
- CPU usage
- Error rate
- Database connection status

### Automatic Restarts

**App Platform:** Automatic
**PM2:** Configured in `ecosystem.config.cjs`
- Daily restart at 3 AM (for memory cleanup)
- Auto-restart on crashes
- Max 10 restart attempts

### Backup Strategy

1. **Database:** Enable automated backups in MongoDB Atlas
2. **Code:** Version controlled in GitHub
3. **Environment:** Store encrypted backup of `.env` securely

---

## Troubleshooting

### Deployment Fails

```bash
# Check GitHub Actions logs
# Go to: Repository → Actions → Latest workflow

# Common issues:
1. Missing GitHub secrets
2. Invalid Digital Ocean token
3. Docker build errors
4. Environment variable typos
```

### Health Check Fails

```bash
# SSH into server (droplet only)
ssh root@<droplet-ip>

# Check PM2 status
pm2 status

# View error logs
pm2 logs enviro-backend --err --lines 50

# Check database connection
curl http://localhost:5000/health

# Restart if needed
pm2 restart enviro-backend
```

### High Memory Usage

```bash
# Droplet: Restart PM2
pm2 restart enviro-backend

# App Platform: Increase instance size
# Dashboard → Your App → Settings → Resources
```

### CORS Errors

Update `ALLOWED_ORIGINS` environment variable:
```bash
ALLOWED_ORIGINS=https://domain1.com,https://domain2.com
```

### Database Connection Issues

Check MongoDB Atlas:
1. Verify IP whitelist (add `0.0.0.0/0` for testing)
2. Check connection string format
3. Verify credentials
4. Test connection from server

---

## Scaling Recommendations

### Performance Optimization
- **< 100 users:** 1 instance, Basic plan ($5/mo)
- **100-1000 users:** 2 instances, Basic plan ($10/mo)
- **1000-10k users:** 2 instances, Professional plan ($24/mo)
- **10k+ users:** 3+ instances, Professional plan, add CDN

### Database Scaling
- **< 1000 users:** MongoDB Atlas M0 (Free)
- **1000-10k users:** MongoDB Atlas M10 ($57/mo)
- **10k+ users:** MongoDB Atlas M20+ ($178+/mo)

---

## Cost Estimates

### Option A: App Platform
```
- App Platform (2 instances): $10/mo
- Container Registry: $0 (first 500MB free)
- MongoDB Atlas M10: $57/mo
- Domain: $12/year
---------------------------------
Total: ~$67-70/month
```

### Option B: Droplet
```
- Droplet (2GB RAM): $12/mo
- Managed Database: $15/mo
- Domain: $12/year
---------------------------------
Total: ~$27-30/month
```

---

## Support & Resources

- **Documentation:** [Digital Ocean Docs](https://docs.digitalocean.com)
- **Community:** [Digital Ocean Community](https://www.digitalocean.com/community)
- **Status:** [Digital Ocean Status](https://status.digitalocean.com)

---

## Maintenance Checklist

### Weekly
- ✅ Check error logs
- ✅ Monitor response times
- ✅ Review resource usage

### Monthly
- ✅ Review and rotate secrets
- ✅ Update dependencies
- ✅ Check for security updates
- ✅ Review billing and optimize costs

### Quarterly
- ✅ Full security audit
- ✅ Load testing
- ✅ Backup restoration test
- ✅ Disaster recovery drill

---

**Last Updated:** January 5, 2025
**Version:** 1.0.0
**Contact:** your-email@domain.com
