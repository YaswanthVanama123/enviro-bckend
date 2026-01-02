# 🚀 Backend Deployment Guide - Node.js to cPanel

This guide explains how to deploy your Node.js backend to cPanel at:
**https://server.enviromasternva.com**

---

## ✅ What You Already Have (Pre-Setup Done)

1. ✅ Subdomain created: `server.enviromasternva.com`
2. ✅ Document root exists: `/public_html/server`
3. ✅ Your backend entry file is: **`server.js`**
4. ✅ Server listens on `process.env.PORT` (cPanel compatible)
5. ✅ CORS configured with `process.env.ALLOWED_ORIGINS`
6. ✅ All production credentials configured in `.env` file

---

## 📋 Before You Start - Quick Checks

### Check A: Your Backend Code Structure
```
enviro-bckend/
├── server.js                  ✅ Entry file (loads dotenv and src/server.js)
├── package.json               ✅ Dependencies and scripts
├── .env                       ✅ Production environment variables
└── src/
    ├── server.js              ✅ Main server file (Express app)
    ├── app.js                 ✅ Express app configuration
    ├── routes/                ✅ API routes
    ├── models/                ✅ Database models
    └── ...
```

### Check B: Server Port Configuration ✅
Your `src/server.js` already has this correct:
```javascript
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`));
```

---

## 🎯 Deployment Steps

### PART 1: Prepare Backend Code

#### Step 1: Create Folder for Backend Code (Recommended Location)

We'll keep your backend code outside `public_html` for security.

1. **cPanel** → **File Manager**
2. Navigate to **home directory** (you'll see: `etc`, `mail`, `public_html`, etc.)
3. Click **"+ Folder"** button
4. Create folder: **`nodeapps`**
5. Open the `nodeapps` folder
6. Create another folder: **`enviro-backend`**

✅ **Final path**: `/home/<your-cpanel-username>/nodeapps/enviro-backend`

---

#### Step 2: Upload Backend Code

##### Option A: Upload ZIP (Recommended for First Time)

1. On your local machine, go to:
   ```bash
   cd /Users/yaswanthgandhi/Documents/analytics/
   ```

2. Create a ZIP of the backend folder:
   ```bash
   # On Mac/Linux:
   zip -r enviro-backend.zip enviro-bckend/ -x "*/node_modules/*" -x "*/.git/*"

   # Or manually: Right-click enviro-bckend folder → Compress
   # Then delete node_modules and .git from the zip
   ```

3. In **cPanel** → **File Manager** → `nodeapps/enviro-backend`

4. Click **Upload** button

5. Select your `enviro-backend.zip` file

6. Wait for upload to complete

7. Right-click the zip file → **Extract**

8. After extraction, verify the structure:
   ```
   nodeapps/enviro-backend/
   ├── server.js          ← Must be directly here
   ├── package.json       ← Must be directly here
   ├── .env              ← Must be directly here
   └── src/
   ```

⚠️ **Common Mistake**: If you see `enviro-backend/enviro-bckend/server.js` (double nesting), move files one level up.

##### Option B: Upload via FTP (For Updates)

1. Use FileZilla or any FTP client
2. Connect to: `ftp.enviromasternva.com` (or `enviromasternva.com`)
3. Navigate to: `/home/<username>/nodeapps/enviro-backend/`
4. Upload all files from your local `enviro-bckend` folder

---

### PART 2: Setup Node.js Application in cPanel

#### Step 3: Open "Setup Node.js App"

1. **cPanel Home** → Search: **"Setup Node.js App"**
2. Click **"Setup Node.js App"**
3. You'll see a page with a **"Create Application"** button
4. Click **"Create Application"**

---

#### Step 4: Configure Node.js Application

Fill in the form with these **exact values**:

| Field | Value | Notes |
|-------|-------|-------|
| **Node.js version** | `20.x.x` or `18.x.x` | Pick the highest available version |
| **Application mode** | `Production` | Important for performance |
| **Application root** | `nodeapps/enviro-backend` | Path to your uploaded code |
| **Application URL** | `server.enviromasternva.com` | Select from dropdown |
| **Application startup file** | `server.js` | Your entry file |
| **Passenger log file** | Leave default | For debugging |

✅ **After filling**, click: **"Create"**

---

### PART 3: Install Dependencies

#### Step 5: Run NPM Install

After the app is created, you'll see your app in the list.

1. Click on your app name: **`server.enviromasternva.com`**
2. You'll see several buttons and options
3. Click: **"Run NPM Install"** button (or "Install Packages")
4. Wait for installation to complete (may take 1-2 minutes)
5. Check for success message

✅ **This installs all dependencies** from `package.json`

---

### PART 4: Configure Environment Variables

#### Step 6: Add Environment Variables

In the Node.js app screen, scroll down to find:
**"Environment Variables"** section

Click **"Add Variable"** for each of these:

##### ⚠️ COPY THESE EXACTLY FROM YOUR .env FILE:

| Variable Name | Value |
|---------------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` (cPanel may override this, but set it anyway) |
| `SERVER_URL` | `https://server.enviromasternva.com` |
| `MONGO_URI` | `mongodb+srv://vanamayaswanth1_db_user:NzvLPS9c2KO02tDz@cluster0.f1kzy9b.mongodb.net/enviro_master?retryWrites=true&w=majority` |
| `MONGO_DB` | `enviro_master` |
| `PDF_REMOTE_BASE` | `http://142.93.213.187:3000` |
| `PDF_MAX_BODY_MB` | `5` |
| `PDF_REMOTE_TIMEOUT_MS` | `90000` |
| `ZOHO_CLIENT_ID` | `1000.1EZQQI578R0FF0D892H8LFWROMYNQV` |
| `ZOHO_CLIENT_SECRET` | `75063a1499cfcff533a773b84eb6feb63948165d71` |
| `ZOHO_ACCOUNTS_URL` | `https://accounts.zoho.in` |
| `ZOHO_BIGIN_API_URL` | `https://www.zohoapis.in/bigin/v2` |
| `ZOHO_CRM_API_URL` | `https://www.zohoapis.in/crm/v3` |
| `ZOHO_REDIRECT_URI` | `https://server.enviromasternva.com/oauth/callback` |
| `ZOHO_REFRESH_TOKEN` | `1000.8d0321c0d20a3ad9510702f16f4ed005.2b87fb7ed88fa12be4df88e02548c16b` |
| `EMAIL_HOST` | `enviromasternva.com` |
| `EMAIL_PORT` | `465` |
| `EMAIL_SECURE` | `true` |
| `EMAIL_USER` | `hvanama@enviromasternva.com` |
| `EMAIL_PASSWORD` | `Satyavani@123` |
| `EMAIL_FROM_NAME` | `EnviroMaster NVA` |
| `EMAIL_FROM_ADDRESS` | `hvanama@enviromasternva.com` |
| `JWT_SECRET` | `ecb3d1020938632c45709d08c96f478f9887e93e42395e1fd9be81c0eac72d00e00c0b78ba29691304cd14eaee41edeecd55218463f27e7217a25e891e14fe2a` |
| `JWT_EXPIRES_IN` | `7d` |
| `ALLOWED_ORIGINS` | `https://enviromasternva.com,http://localhost:5173,http://localhost:3000` |
| `LOG_LEVEL` | `info` |

⚠️ **CRITICAL**: Double-check each value for typos!

After adding all variables, click: **"Save"**

---

### PART 5: Start the Application

#### Step 7: Restart the Application

1. In the Node.js app screen, find the **"Restart"** button (or "Start")
2. Click **"Restart"**
3. Wait for the app to start (10-30 seconds)
4. Look for status: **"Running"** or **"Started"**

---

### PART 6: Test Your Backend

#### Step 8: Test Health Endpoint

1. Open a new browser tab
2. Visit: **`https://server.enviromasternva.com/health`**

**Expected Response:**
```json
{"ok":true}
```

✅ **If you see this, your backend is running!**

❌ **If you get an error**, go to Step 11 (Check Logs)

---

#### Step 9: Test API Endpoints

Try these URLs in your browser:

1. **Health Check:**
   ```
   https://server.enviromasternva.com/health
   ```
   Expected: `{"ok":true}`

2. **OAuth Debug:**
   ```
   https://server.enviromasternva.com/oauth/debug
   ```
   Expected: Page showing Zoho configuration

---

### PART 7: Configure SSL (HTTPS)

#### Step 10: Enable SSL Certificate

1. **cPanel** → Search: **"SSL/TLS Status"**
2. Find: `server.enviromasternva.com`
3. Click **"Run AutoSSL"** (or it may already have SSL)
4. Wait for SSL certificate to be issued (1-5 minutes)
5. Verify: `https://server.enviromasternva.com/health` works with HTTPS

✅ **Your subdomain should now have SSL certificate**

---

### PART 8: Troubleshooting

#### Step 11: Check Logs (If Something Fails)

1. In the Node.js app screen, look for:
   - **"View logs"** or **"Log file"** link
   - **"stderr.log"** or **"stdout.log"** buttons

2. Click to view logs

3. Look for error messages:

**Common errors and fixes:**

##### Error: "Cannot find module"
```
Error: Cannot find module 'express'
```
**Fix**: Run NPM Install again (Step 5)

##### Error: "EADDRINUSE" (Port already in use)
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Fix**: This shouldn't happen on cPanel (it manages ports automatically). Restart the app.

##### Error: "MongoServerError: Authentication failed"
```
MongoServerError: Authentication failed
```
**Fix**: Check `MONGO_URI` environment variable is correct

##### Error: "CORS policy error" (in browser console)
```
Access to fetch at 'https://server.enviromasternva.com/api/pdf/list'
from origin 'https://enviromasternva.com' has been blocked by CORS policy
```
**Fix**: Check `ALLOWED_ORIGINS` includes `https://enviromasternva.com`

---

### PART 9: Update Zoho API Console

#### Step 12: Update Zoho Redirect URI

Your backend is now running at `https://server.enviromasternva.com`, so you must update Zoho:

1. Go to: **[https://api-console.zoho.in/](https://api-console.zoho.in/)**
2. Sign in with your Zoho account
3. Find your app (Client ID: `1000.1EZQQI578R0FF0D892H8LFWROMYNQV`)
4. Click **"Edit"** or **"Settings"**
5. Find: **"Authorized Redirect URIs"**
6. **Add** this URL:
   ```
   https://server.enviromasternva.com/oauth/callback
   ```
7. You can **keep** the localhost URL for local development:
   ```
   http://localhost:5000/oauth/callback
   ```
8. Click **"Update"** or **"Save"**

---

#### Step 13: Regenerate Zoho Refresh Token (Production)

After updating the redirect URI, regenerate the token for production:

1. Open browser tab
2. Visit:
   ```
   https://server.enviromasternva.com/oauth/zoho/auth
   ```
3. You'll be redirected to Zoho login
4. Log in with your Zoho account
5. Click **"Accept"** to authorize the application
6. You should see:
   ```
   ✅ OAuth Authorization Successful!
   Refresh token has been saved.
   ```

✅ **Done! Zoho integration is now configured for production.**

---

### PART 10: Verify Everything Works

#### Step 14: Complete Verification Checklist

- [ ] Health endpoint returns `{"ok":true}`:
  ```
  https://server.enviromasternva.com/health
  ```

- [ ] MongoDB connected (check logs for "✅ Database connection successful")

- [ ] Zoho OAuth working (check logs for "✅ Refresh token saved")

- [ ] Email SMTP credentials working (test by sending email from app)

- [ ] SSL certificate active (HTTPS works)

- [ ] CORS allows your frontend domain (`https://enviromasternva.com`)

- [ ] All environment variables set (26 total)

- [ ] Application status: **Running**

---

## 🔄 How to Update Your Backend (After Initial Deployment)

### Method 1: Via File Manager (Quick Updates)

1. **cPanel** → **File Manager**
2. Navigate to: `nodeapps/enviro-backend/`
3. Edit files directly or upload changed files
4. After changes, go to **Setup Node.js App**
5. Find your app → Click **"Restart"**

### Method 2: Via FTP (For Multiple Files)

1. Connect via FTP to your cPanel
2. Navigate to: `/home/<username>/nodeapps/enviro-backend/`
3. Upload updated files
4. Restart the app in cPanel

### Method 3: Via Git (Advanced - Optional)

You can set up Git deployment for automatic updates. See cPanel Git documentation.

---

## 🔧 Important Notes

### Will This Affect Your Existing Website?

✅ **NO! Here's why:**

- Backend runs on **subdomain**: `server.enviromasternva.com`
- Code is in **separate folder**: `~/nodeapps/enviro-backend`
- Main domain (`enviromasternva.com`) is **untouched**
- Other folders (`Customer/`, `Employee/`, `Sales/`) are **untouched**
- Frontend at `/agreement/` is **separate** from backend

### Port Management

- cPanel **automatically assigns** the port for your Node.js app
- You **don't need to worry** about port conflicts
- The `process.env.PORT` in your code will receive the cPanel-assigned port

### Environment Variables

- **DO NOT** commit `.env` file to Git
- Environment variables are stored in **cPanel dashboard** (encrypted)
- If you change env vars in cPanel, **restart** the app to apply changes

### Memory & CPU Limits

- Free/shared hosting has **resource limits**
- If your app uses too much memory/CPU, it may be stopped
- Monitor logs for "out of memory" errors
- Consider upgrading to VPS if needed

---

## 🐛 Common Issues and Fixes

### Issue 1: Application Won't Start

**Symptoms**: Status shows "Stopped" or error in logs

**Solutions**:
1. Check logs (stderr.log, stdout.log)
2. Verify `server.js` is in the correct location
3. Ensure Node.js version is compatible (18 or 20)
4. Run NPM Install again
5. Check all environment variables are set

### Issue 2: "Cannot find module" Errors

**Symptoms**: Errors like "Cannot find module 'express'"

**Solutions**:
1. Run NPM Install from cPanel dashboard
2. Check `package.json` has all dependencies
3. Delete `node_modules` folder and reinstall

### Issue 3: MongoDB Connection Fails

**Symptoms**: "MongoServerError" in logs

**Solutions**:
1. Check MongoDB Atlas **Network Access** allows: `0.0.0.0/0`
2. Verify `MONGO_URI` is correct
3. Test connection string with MongoDB Compass

### Issue 4: CORS Errors from Frontend

**Symptoms**: "blocked by CORS policy" in browser console

**Solutions**:
1. Check `ALLOWED_ORIGINS` includes `https://enviromasternva.com`
2. Restart backend after changing env vars
3. Verify frontend is using correct backend URL

### Issue 5: SSL Certificate Issues

**Symptoms**: "Not Secure" warning or SSL errors

**Solutions**:
1. Run AutoSSL in cPanel
2. Wait 5-10 minutes for certificate to propagate
3. Force HTTPS redirect if needed

---

## 📊 Your URLs (Save These)

```
BACKEND API:        https://server.enviromasternva.com
HEALTH ENDPOINT:    https://server.enviromasternva.com/health
OAUTH DEBUG:        https://server.enviromasternva.com/oauth/debug
OAUTH AUTHORIZE:    https://server.enviromasternva.com/oauth/zoho/auth

FRONTEND:           https://enviromasternva.com/agreement
MAIN DOMAIN:        https://enviromasternva.com

CPANEL LOGIN:       https://enviromasternva.com:2083
NODE.JS APP SETUP:  cPanel → Setup Node.js App
FILE MANAGER:       cPanel → File Manager
```

---

## ✅ Deployment Complete Checklist

Before going live, verify:

### Backend Checks
- [ ] Code uploaded to `~/nodeapps/enviro-backend/`
- [ ] Node.js app created in cPanel
- [ ] All 26 environment variables added
- [ ] NPM dependencies installed
- [ ] Application status: Running
- [ ] Health endpoint works: `https://server.enviromasternva.com/health`
- [ ] SSL certificate active (HTTPS)
- [ ] MongoDB connection successful
- [ ] Zoho redirect URI updated in API Console
- [ ] Zoho refresh token regenerated
- [ ] Logs show no errors

### Frontend Integration
- [ ] Frontend .env.production has: `VITE_API_BASE_URL=https://server.enviromasternva.com`
- [ ] Backend CORS allows: `https://enviromasternva.com`
- [ ] Frontend can make API calls successfully
- [ ] No CORS errors in browser console

---

## 📚 Additional Resources

- [cPanel Node.js Documentation](https://docs.cpanel.net/knowledge-base/web-services/guide-to-node.js/)
- [MongoDB Atlas Network Access](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- [Zoho API Console](https://api-console.zoho.in/)

---

## 🆘 Getting Help

If you encounter issues:

1. **Check logs first**: Setup Node.js App → Your App → View Logs
2. **Test health endpoint**: `https://server.enviromasternva.com/health`
3. **Verify environment variables**: All 26 variables set correctly
4. **Check MongoDB Atlas**: Network Access allows 0.0.0.0/0
5. **Review CORS settings**: Backend allows frontend origin

---

**🎉 Congratulations! Your backend is now live on cPanel!**

Your API is accessible at: **`https://server.enviromasternva.com`**

Backend is running independently on its subdomain, with no effect on your main website or other services.
