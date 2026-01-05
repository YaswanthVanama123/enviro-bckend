# 🚀 Quick Start: Deploy to Digital Ocean

## Step-by-Step Setup (5 minutes)

### 1. Create Digital Ocean Account & Container Registry

```bash
# Install Digital Ocean CLI
brew install doctl  # macOS
# OR
snap install doctl  # Linux

# Login to Digital Ocean
doctl auth init

# Create container registry
doctl registry create enviro-registry
```

### 2. Configure GitHub Secrets

Go to: **GitHub Repository → Settings → Secrets and variables → Actions → New secret**

Add these secrets:

| Secret Name | How to Get It | Example |
|------------|---------------|---------|
| `DIGITALOCEAN_ACCESS_TOKEN` | [Generate here](https://cloud.digitalocean.com/account/api/tokens) | `dop_v1_xxxxx...` |
| `DIGITALOCEAN_REGISTRY_NAME` | From step 1 | `enviro-registry` |
| `DIGITALOCEAN_APP_ID` | After creating app (step 3) | `abc123-def456` |

### 3. Create App on Digital Ocean

**Via Dashboard (Easiest):**

1. Go to https://cloud.digitalocean.com/apps/new
2. Connect GitHub → Select `YaswanthVanama123/enviro-bckend` → Branch: `main`
3. Build: Select "Dockerfile"
4. Resources: Basic ($5/mo), 2 instances
5. Environment Variables: Add these (see below)
6. **Copy the App ID** from URL: `https://cloud.digitalocean.com/apps/YOUR_APP_ID`
7. Add `DIGITALOCEAN_APP_ID` to GitHub secrets

**Via CLI (Advanced):**

```bash
# Create app from spec file
doctl apps create --spec .do/app.yaml

# Get app ID
doctl apps list
```

### 4. Add Environment Variables to Digital Ocean App

In App Platform dashboard → Your App → Settings → Environment Variables:

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/enviro
JWT_SECRET=your-super-secret-key-32-chars-minimum
ZOHO_CLIENT_ID=your-zoho-client-id
ZOHO_CLIENT_SECRET=your-zoho-client-secret
ZOHO_REFRESH_TOKEN=your-zoho-refresh-token
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

### 5. Enable Auto-Deploy

In GitHub repository → Settings → Secrets and variables → Actions → Variables tab:

Add variable:
```
Name: USE_APP_PLATFORM
Value: true
```

### 6. Deploy! 🎉

```bash
git add .
git commit -m "feat: setup production deployment"
git push origin main
```

**What happens now:**
1. ✅ GitHub Actions runs automatically
2. ✅ Tests run
3. ✅ Docker image builds
4. ✅ Pushes to Digital Ocean Registry
5. ✅ Deploys to App Platform
6. ✅ Health check runs

**Monitor deployment:**
- GitHub: Repository → Actions tab
- Digital Ocean: Apps → Your App → Activity

### 7. Verify Deployment

```bash
# Get your app URL from Digital Ocean dashboard
# Or use CLI:
doctl apps list --format DefaultIngress,LiveURL

# Test health endpoint
curl https://your-app-url.ondigitalocean.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-05T12:00:00.000Z",
  "uptime": 45.6,
  "database": {
    "status": "connected"
  }
}
```

---

## 🎯 That's It!

From now on, **every push to `main` branch automatically deploys** to production.

### Common Next Steps

1. **Add Custom Domain:**
   - App Platform → Settings → Domains → Add Domain
   - Point your domain to the provided CNAME

2. **Update Frontend:**
   ```bash
   # In your frontend .env.production
   VITE_API_BASE_URL=https://your-app-url.ondigitalocean.app
   ```

3. **Update Zoho Redirect URI:**
   - Zoho API Console → Update redirect to:
   - `https://your-app-url.ondigitalocean.app/oauth/callback`

---

## 📊 Monitoring

### View Logs
```bash
doctl apps logs <app-id> --follow
```

### View Metrics
Digital Ocean Dashboard → Apps → Your App → Insights

---

## 🔧 Troubleshooting

### Deployment Fails?
1. Check GitHub Actions: Repository → Actions → Latest run
2. Common issues:
   - Missing GitHub secrets
   - Invalid Digital Ocean token
   - Dockerfile syntax errors

### App Won't Start?
1. Check logs: `doctl apps logs <app-id>`
2. Verify environment variables in DO dashboard
3. Test health endpoint: `curl your-app-url/health`

### Database Connection Issues?
1. Verify `MONGODB_URI` format
2. Check MongoDB Atlas IP whitelist (add `0.0.0.0/0`)
3. Test connection string locally

---

## 💰 Costs

**Minimum Setup:**
- App Platform: 2 instances × $5/mo = **$10/month**
- Container Registry: First 500MB free
- **Total: $10/month**

**With Database:**
- MongoDB Atlas M0: **Free** (500MB)
- MongoDB Atlas M10: **$57/month** (production recommended)

---

## 📚 Full Documentation

See [`PRODUCTION_DEPLOYMENT_GUIDE.md`](./PRODUCTION_DEPLOYMENT_GUIDE.md) for:
- Alternative deployment options (Droplet)
- Detailed configuration
- Security best practices
- Scaling recommendations
- Cost optimization

---

## 🆘 Need Help?

- Full Guide: `PRODUCTION_DEPLOYMENT_GUIDE.md`
- Digital Ocean Docs: https://docs.digitalocean.com
- Community: https://www.digitalocean.com/community

---

**Setup Time:** 5-10 minutes
**Cost:** $10-70/month (depending on scale)
**Difficulty:** ⭐⭐☆☆☆ Easy
