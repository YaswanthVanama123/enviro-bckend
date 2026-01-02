# Digital Ocean Deployment Guide - EnviroMaster Backend

## Overview
This guide will help you deploy the EnviroMaster backend to Digital Ocean using:
- **Ubuntu 22.04 Droplet** (VPS server)
- **PM2** (Process manager for Node.js)
- **Nginx** (Reverse proxy for SSL/HTTPS)
- **MongoDB Atlas** (Cloud database - already configured)

---

## Prerequisites

1. Digital Ocean account
2. Domain name (optional, can use IP address initially)
3. MongoDB Atlas account (already configured)
4. Zoho API credentials (already configured)

---

## Step 1: Create Digital Ocean Droplet

### 1.1 Create Droplet
1. Log in to Digital Ocean: https://cloud.digitalocean.com
2. Click **Create** → **Droplets**
3. Choose configuration:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic ($12/month - 2GB RAM, 50GB SSD)
   - **Datacenter**: Choose closest to your users (e.g., Bangalore, Singapore for India)
   - **Authentication**: SSH key (recommended) or Password
   - **Hostname**: `enviro-backend`
4. Click **Create Droplet**
5. Note your droplet IP address (e.g., `134.122.45.67`)

---

## Step 2: Initial Server Setup

### 2.1 Connect to Server
```bash
ssh root@YOUR_DROPLET_IP
# Example: ssh root@134.122.45.67
```

### 2.2 Update System
```bash
apt update
apt upgrade -y
```

### 2.3 Install Node.js 20 (LTS)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 2.4 Install PM2 (Process Manager)
```bash
npm install -g pm2
pm2 --version  # Verify installation
```

### 2.5 Create Application Directory
```bash
mkdir -p /var/www/enviro-backend
cd /var/www/enviro-backend
```

---

## Step 3: Upload Backend Code

### Option A: Using Git (Recommended)
```bash
# On your server
cd /var/www/enviro-backend
git clone https://github.com/YOUR_USERNAME/enviro-backend.git .
```

### Option B: Using SCP (Manual Upload)
```bash
# On your local machine
cd /Users/yaswanthgandhi/Documents/analytics/enviro-bckend
scp -r * root@YOUR_DROPLET_IP:/var/www/enviro-backend/
```

### Option C: Using SFTP Client
- Use FileZilla, Cyberduck, or WinSCP
- Connect to `YOUR_DROPLET_IP` with SSH credentials
- Upload all files to `/var/www/enviro-backend/`

---

## Step 4: Configure Environment

### 4.1 Create .env File
```bash
cd /var/www/enviro-backend
nano .env
```

### 4.2 Copy and Update .env Content
```bash
NODE_ENV=production
PORT=5000
SERVER_URL=http://YOUR_DROPLET_IP:5000

# MongoDB Atlas
MONGO_URI=mongodb+srv://vanamayaswanth1_db_user:NzvLPS9c2KO02tDz@cluster0.f1kzy9b.mongodb.net/enviro_master?retryWrites=true&w=majority
MONGO_DB=enviro_master

# PDF Service
PDF_REMOTE_BASE=http://142.93.213.187:3000
PDF_MAX_BODY_MB=5
PDF_REMOTE_TIMEOUT_MS=90000

# Zoho Bigin
ZOHO_CLIENT_ID=1000.1EZQQI578R0FF0D892H8LFWROMYNQV
ZOHO_CLIENT_SECRET=75063a1499cfcff533a773b84eb6feb63948165d71
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_BIGIN_API_URL=https://www.zohoapis.in/bigin/v2
ZOHO_CRM_API_URL=https://www.zohoapis.in/crm/v3
ZOHO_REDIRECT_URI=http://YOUR_DROPLET_IP:5000/oauth/callback
ZOHO_REFRESH_TOKEN=1000.8d0321c0d20a3ad9510702f16f4ed005.2b87fb7ed88fa12be4df88e02548c16b

# Email
EMAIL_HOST=enviromasternva.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=hvanama@enviromasternva.com
EMAIL_PASSWORD=Satyavani@123
EMAIL_FROM_NAME=EnviroMaster NVA
EMAIL_FROM_ADDRESS=hvanama@enviromasternva.com

# Security
JWT_SECRET=ecb3d1020938632c45709d08c96f478f9887e93e42395e1fd9be81c0eac72d00e00c0b78ba29691304cd14eaee41edeecd55218463f27e7217a25e891e14fe2a
JWT_EXPIRES_IN=7d

# CORS
ALLOWED_ORIGINS=https://enviromasternva.com,http://localhost:5173,http://localhost:3000

# Logging
LOG_LEVEL=info
```

**IMPORTANT:** Replace `YOUR_DROPLET_IP` with your actual droplet IP address!

Save: `Ctrl+O`, `Enter`, `Ctrl+X`

---

## Step 5: Install Dependencies

```bash
cd /var/www/enviro-backend
npm install --production
```

**This will take 2-5 minutes** depending on your server speed.

---

## Step 6: Test Server Manually

```bash
cd /var/www/enviro-backend
node server.js
```

You should see:
```
🚀 Server running on port 5000
✅ Connected to MongoDB
✅ MongoDB connection successful! Database: enviro_master
```

**Test in browser**: `http://YOUR_DROPLET_IP:5000/health`

You should see: `{"status":"ok"}`

**Stop server**: Press `Ctrl+C`

---

## Step 7: Start with PM2

### 7.1 Start Application
```bash
cd /var/www/enviro-backend
pm2 start server.js --name enviro-backend
```

### 7.2 Save PM2 Configuration
```bash
pm2 save
```

### 7.3 Setup PM2 Auto-Start on Reboot
```bash
pm2 startup
# Copy and run the command it shows (usually starts with 'sudo env PATH=...')
```

### 7.4 Check Status
```bash
pm2 status
pm2 logs enviro-backend  # View logs (Ctrl+C to exit)
```

---

## Step 8: Configure Firewall

### 8.1 Allow Required Ports
```bash
ufw allow OpenSSH
ufw allow 5000
ufw enable
ufw status  # Verify firewall rules
```

---

## Step 9: Test Backend API

### 9.1 Test Health Endpoint
```bash
curl http://YOUR_DROPLET_IP:5000/health
```

Should return: `{"status":"ok"}`

### 9.2 Test MongoDB Connection
Check PM2 logs:
```bash
pm2 logs enviro-backend --lines 50
```

Look for: `✅ Connected to MongoDB`

---

## Step 10: Update Frontend Configuration

### 10.1 Update Frontend .env.production
```bash
# On your local machine
cd /Users/yaswanthgandhi/Documents/analytics/enviromaster
nano .env.production
```

Update to:
```
VITE_API_BASE_URL=http://YOUR_DROPLET_IP:5000
```

### 10.2 Rebuild Frontend
```bash
npm run build
```

### 10.3 Deploy Frontend
- Deploy the `dist/` folder to your frontend hosting (Vercel, Netlify, or cPanel)

---

## Step 11: Update Zoho Redirect URI

1. Go to: https://api-console.zoho.in/
2. Find your app: **EnviroMaster NVA**
3. Click **Edit**
4. Update **Redirect URI** to: `http://YOUR_DROPLET_IP:5000/oauth/callback`
5. Click **Update**

---

## Step 12: Regenerate Zoho Refresh Token

1. Visit: `http://YOUR_DROPLET_IP:5000/oauth/zoho/auth`
2. Log in with Zoho account
3. Authorize the application
4. Copy the new refresh token
5. Update `.env` file:
   ```bash
   nano /var/www/enviro-backend/.env
   # Update ZOHO_REFRESH_TOKEN with new value
   ```
6. Restart backend:
   ```bash
   pm2 restart enviro-backend
   ```

---

## Optional: Configure Nginx for SSL/HTTPS

### Why Use Nginx?
- Enable HTTPS (SSL/TLS encryption)
- Better performance
- Professional domain-based URLs

### Step 1: Install Nginx
```bash
apt install -y nginx
```

### Step 2: Configure Nginx Reverse Proxy
```bash
nano /etc/nginx/sites-available/enviro-backend
```

Add configuration:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 3: Enable Site
```bash
ln -s /etc/nginx/sites-available/enviro-backend /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl restart nginx
```

### Step 4: Install SSL with Let's Encrypt (If using domain)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.enviromasternva.com
```

Follow prompts to setup SSL.

### Step 5: Update Environment Variables
Update `.env` to use HTTPS:
```bash
SERVER_URL=https://api.enviromasternva.com
ZOHO_REDIRECT_URI=https://api.enviromasternva.com/oauth/callback
```

Restart backend:
```bash
pm2 restart enviro-backend
```

---

## Useful PM2 Commands

```bash
# View logs
pm2 logs enviro-backend

# View real-time monitoring
pm2 monit

# Restart application
pm2 restart enviro-backend

# Stop application
pm2 stop enviro-backend

# Delete application from PM2
pm2 delete enviro-backend

# View all running processes
pm2 list

# View detailed info
pm2 show enviro-backend
```

---

## Troubleshooting

### Issue: Server not starting
```bash
pm2 logs enviro-backend --lines 100
# Check for error messages
```

### Issue: MongoDB connection failed
- Verify MongoDB Atlas allows connections from `0.0.0.0/0` (or add droplet IP)
- Check MONGO_URI in `.env` file

### Issue: Cannot access from browser
```bash
# Check if server is running
pm2 status

# Check firewall
ufw status

# Check if port 5000 is listening
netstat -tulpn | grep 5000
```

### Issue: Zoho OAuth not working
- Verify ZOHO_REDIRECT_URI matches exactly in Zoho API Console
- Check if domain/IP is accessible publicly

---

## Cost Estimate

- **Digital Ocean Droplet**: $12/month (2GB RAM)
- **Domain Name**: ~$12/year (optional)
- **SSL Certificate**: Free (Let's Encrypt)
- **MongoDB Atlas**: Free tier (512MB)
- **Total**: ~$12/month

---

## Security Best Practices

1. **Never commit .env file to Git**
2. **Use SSH keys instead of passwords**
3. **Keep Node.js and packages updated**: `npm outdated`
4. **Enable firewall**: Only allow necessary ports
5. **Use HTTPS in production** (with Nginx + Let's Encrypt)
6. **Rotate JWT_SECRET periodically**
7. **Monitor logs**: `pm2 logs enviro-backend`

---

## Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs enviro-backend`
2. Check server resources: `htop` or `pm2 monit`
3. Verify all environment variables are set correctly
4. Ensure MongoDB Atlas network access is configured

---

## Next Steps After Deployment

1. ✅ Verify all API endpoints work
2. ✅ Test PDF generation
3. ✅ Test Zoho integration
4. ✅ Test email sending
5. ✅ Update frontend to use production backend URL
6. ✅ Test end-to-end workflow
7. ✅ Setup monitoring and alerts (optional)
8. ✅ Setup automated backups (optional)

---

**Deployment Complete! 🎉**

Your backend should now be running at:
- HTTP: `http://YOUR_DROPLET_IP:5000`
- HTTPS (if configured): `https://api.enviromasternva.com`
