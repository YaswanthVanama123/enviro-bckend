# EnviroMaster Backend - Deployment Guide

This guide provides step-by-step instructions for deploying the EnviroMaster backend to Render.

## Prerequisites

Before deploying, ensure you have:

- ✅ GitHub repository with your code
- ✅ MongoDB Atlas account and database
- ✅ Zoho Bigin API credentials (Client ID & Secret)
- ✅ Email account for SMTP (enviromasternva.com)
- ✅ Frontend URL (for CORS configuration)

## Deployment Steps

### 1. Prepare MongoDB Atlas

1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Navigate to **Network Access** → **Add IP Address**
3. Select **Allow access from anywhere** (0.0.0.0/0)
   - This is required for Render's dynamic IP addresses
4. Copy your connection string from **Database** → **Connect** → **Connect your application**
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`

### 2. Push Code to GitHub

```bash
# Initialize git repository (if not already done)
git init

# Add all files
git add .

# Commit changes
git commit -m "Prepare backend for production deployment"

# Add remote repository
git remote add origin https://github.com/your-username/enviro-backend.git

# Push to GitHub
git push -u origin main
```

### 3. Deploy to Render

#### Option A: Using Blueprint (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Blueprint**
3. Connect your GitHub repository
4. Render will detect `render.yaml` and configure automatically
5. Click **Apply** to start deployment

#### Option B: Manual Setup

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `enviromaster-backend`
   - **Environment**: `Node`
   - **Region**: `Oregon` (or your preferred region)
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free` (for testing)

### 4. Configure Environment Variables

In Render Dashboard, go to **Environment** → **Environment Variables** and add:

#### Application Settings
```
NODE_ENV=production
PORT=5000
SERVER_URL=https://your-app-name.onrender.com
```

#### Database Configuration
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGO_DB=enviro_master
```

#### PDF Service Configuration
```
PDF_REMOTE_BASE=http://142.93.213.187:3000/pdf
PDF_MAX_BODY_MB=5
PDF_REMOTE_TIMEOUT_MS=90000
```

#### Zoho Bigin Integration
```
ZOHO_CLIENT_ID=your_zoho_client_id
ZOHO_CLIENT_SECRET=your_zoho_client_secret
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_BIGIN_API_URL=https://www.zohoapis.in/bigin/v2
ZOHO_CRM_API_URL=https://www.zohoapis.in/crm/v3
ZOHO_REDIRECT_URI=https://your-app-name.onrender.com/oauth/callback
```

#### Email Configuration
```
EMAIL_HOST=enviromasternva.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=your_email@enviromasternva.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM_NAME=EnviroMaster NVA
EMAIL_FROM_ADDRESS=your_email@enviromasternva.com
```

#### Security Configuration
```
JWT_SECRET=your_generated_jwt_secret_here
JWT_EXPIRES_IN=7d
```

Generate JWT secret using:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### CORS Configuration
```
ALLOWED_ORIGINS=https://your-frontend.com,https://your-frontend-alt.com
```

#### Logging Configuration
```
LOG_LEVEL=info
```

### 5. Configure Zoho OAuth

1. Go to [Zoho API Console](https://api-console.zoho.in/)
2. Find your application
3. Update **Redirect URI** to: `https://your-app-name.onrender.com/oauth/callback`
4. Save changes

### 6. Complete Zoho OAuth Flow

1. Visit: `https://your-app-name.onrender.com/oauth/zoho/auth`
2. Log in to Zoho and authorize the application
3. The refresh token will be automatically saved
4. Verify in Render logs: "✅ Refresh token saved successfully"

### 7. Verify Deployment

1. **Check Health Endpoint**:
   ```bash
   curl https://your-app-name.onrender.com/health
   ```
   Should return: `{"ok":true}`

2. **Check Database Connection**:
   - Look for "✅ MongoDB connected successfully" in logs

3. **Check Zoho Integration**:
   - Visit: `https://your-app-name.onrender.com/oauth/debug`
   - Verify all credentials are configured

4. **Test PDF Generation**:
   - Create a test proposal through your frontend
   - Check if PDF generates successfully

## Troubleshooting

### Issue: MongoDB Connection Failed

**Solution:**
1. Check MongoDB Atlas Network Access settings
2. Ensure 0.0.0.0/0 is allowed
3. Verify MONGO_URI is correct in Render environment variables
4. Check MongoDB Atlas user has correct permissions

### Issue: Zoho OAuth Fails

**Solution:**
1. Verify ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET are correct
2. Ensure ZOHO_REDIRECT_URI matches exactly in Zoho Console
3. Check Zoho API Console for correct scopes:
   - `ZohoBigin.modules.ALL`
   - `ZohoBigin.modules.attachments.ALL`
   - `ZohoBigin.settings.ALL`
4. Try regenerating the refresh token via OAuth flow

### Issue: CORS Errors from Frontend

**Solution:**
1. Add your frontend URL to ALLOWED_ORIGINS environment variable
2. Ensure format is: `https://your-frontend.com` (no trailing slash)
3. Multiple origins: `https://frontend1.com,https://frontend2.com`

### Issue: PDF Generation Fails

**Solution:**
1. Check PDF service URL (PDF_REMOTE_BASE) is accessible
2. Increase PDF_REMOTE_TIMEOUT_MS if compilation times out
3. Check Render logs for detailed error messages

### Issue: Email Sending Fails

**Solution:**
1. Verify EMAIL_USER and EMAIL_PASSWORD are correct
2. Check email server allows SMTP connections from Render
3. Ensure EMAIL_PORT (465) is not blocked
4. Test email credentials manually using telnet or smtp client

## Monitoring

### View Logs

1. Go to Render Dashboard
2. Select your service
3. Click **Logs** tab
4. Monitor for errors and performance issues

### Check Metrics

1. Go to Render Dashboard
2. Select your service
3. Click **Metrics** tab
4. Monitor:
   - CPU usage
   - Memory usage
   - Response times
   - Error rates

## Updating Deployment

### Push New Changes

```bash
# Make your changes
git add .
git commit -m "Your commit message"
git push origin main
```

Render will automatically detect the push and redeploy.

### Manual Redeploy

1. Go to Render Dashboard
2. Select your service
3. Click **Manual Deploy** → **Deploy latest commit**

## Scaling

### Upgrade Plan

If you need more resources:

1. Go to Render Dashboard
2. Select your service
3. Click **Settings** → **Plan**
4. Upgrade to **Starter** ($7/month) or **Standard** ($25/month)

Benefits:
- More CPU and memory
- Persistent storage
- Custom domains
- No cold starts

## Security Checklist

- ✅ All sensitive data in environment variables (not hardcoded)
- ✅ MongoDB Network Access configured
- ✅ CORS properly restricted to frontend URL
- ✅ JWT secret is strong and random
- ✅ HTTPS enabled (automatic on Render)
- ✅ Helmet security headers enabled
- ✅ Environment is set to production (NODE_ENV=production)

## Support

For issues:
1. Check Render logs first
2. Review this guide's troubleshooting section
3. Check `.env.example` for required variables
4. Verify all environment variables are set correctly

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [Zoho API Documentation](https://www.zoho.com/bigin/developer/)
- [Express.js Best Practices](https://expressjs.com/en/advanced/best-practice-production.html)
