# Digital Ocean Quick Reference

## 🚀 Initial Deployment (One-Time Setup)

### 1. Create Digital Ocean Droplet
- Ubuntu 22.04 LTS
- 2GB RAM ($12/month)
- Note your IP address

### 2. Upload Code to Server
```bash
# Option A: Using SCP (from your local machine)
cd /Users/yaswanthgandhi/Documents/analytics/enviro-bckend
scp -r * root@YOUR_DROPLET_IP:/var/www/enviro-backend/

# Option B: Using Git (on server)
ssh root@YOUR_DROPLET_IP
cd /var/www/enviro-backend
git clone https://github.com/YOUR_REPO/enviro-backend.git .
```

### 3. Run Deployment Script
```bash
ssh root@YOUR_DROPLET_IP
cd /var/www/enviro-backend
chmod +x deploy-digital-ocean.sh
./deploy-digital-ocean.sh
```

### 4. Update .env File
```bash
ssh root@YOUR_DROPLET_IP
nano /var/www/enviro-backend/.env

# Update these values:
SERVER_URL=http://YOUR_DROPLET_IP:5000
ZOHO_REDIRECT_URI=http://YOUR_DROPLET_IP:5000/oauth/callback

# Save: Ctrl+O, Enter, Ctrl+X
pm2 restart enviro-backend
```

---

## 📝 Daily/Regular Commands

### Check Application Status
```bash
ssh root@YOUR_DROPLET_IP
pm2 status
```

### View Logs (Live)
```bash
ssh root@YOUR_DROPLET_IP
pm2 logs enviro-backend
# Press Ctrl+C to exit
```

### View Last 50 Lines of Logs
```bash
ssh root@YOUR_DROPLET_IP
pm2 logs enviro-backend --lines 50 --nostream
```

### Restart Application
```bash
ssh root@YOUR_DROPLET_IP
pm2 restart enviro-backend
```

### Stop Application
```bash
ssh root@YOUR_DROPLET_IP
pm2 stop enviro-backend
```

### Start Application
```bash
ssh root@YOUR_DROPLET_IP
pm2 start enviro-backend
```

---

## 🔄 Updating Code (After Making Changes)

### Method 1: Manual Upload (Easiest)
```bash
# On your local machine
cd /Users/yaswanthgandhi/Documents/analytics/enviro-bckend
scp -r * root@YOUR_DROPLET_IP:/var/www/enviro-backend/

# On server
ssh root@YOUR_DROPLET_IP
cd /var/www/enviro-backend
npm install --production  # Only if package.json changed
pm2 restart enviro-backend
```

### Method 2: Using Git
```bash
# On server
ssh root@YOUR_DROPLET_IP
cd /var/www/enviro-backend
git pull origin main
npm install --production  # Only if package.json changed
pm2 restart enviro-backend
```

---

## 🐛 Troubleshooting

### Server Not Responding
```bash
ssh root@YOUR_DROPLET_IP
pm2 status  # Check if running
pm2 logs enviro-backend --lines 100  # Check for errors
```

### MongoDB Connection Issues
```bash
# Check logs for error
pm2 logs enviro-backend | grep -i mongo

# Verify .env file
cat /var/www/enviro-backend/.env | grep MONGO_URI
```

### PDF Generation Errors
```bash
# Check logs for PDF errors
pm2 logs enviro-backend | grep -i pdf

# Test PDF service
curl http://142.93.213.187:3000/health
```

### Port 5000 Already in Use
```bash
# Find process using port 5000
netstat -tulpn | grep 5000

# Kill the process
pm2 delete enviro-backend
# Or kill by PID
kill -9 <PID>
```

---

## 🔥 Emergency Commands

### Completely Restart Everything
```bash
ssh root@YOUR_DROPLET_IP
pm2 delete all
pm2 start /var/www/enviro-backend/server.js --name enviro-backend
pm2 save
```

### Check Server Resources
```bash
ssh root@YOUR_DROPLET_IP
free -h  # Check RAM usage
df -h    # Check disk space
htop     # Interactive process viewer (press Q to quit)
```

### Reboot Server
```bash
ssh root@YOUR_DROPLET_IP
reboot
# Wait 1-2 minutes, then verify PM2 auto-started
pm2 status
```

---

## ✅ Health Checks

### Test Backend is Running
```bash
curl http://YOUR_DROPLET_IP:5000/health
# Should return: {"status":"ok"}
```

### Test MongoDB Connection
```bash
ssh root@YOUR_DROPLET_IP
pm2 logs enviro-backend --lines 20 | grep MongoDB
# Should see: "✅ Connected to MongoDB"
```

### Test PDF Service
```bash
curl http://142.93.213.187:3000/health
# Should return 200 OK
```

---

## 📧 Update Email/Zoho Credentials

### Update .env File
```bash
ssh root@YOUR_DROPLET_IP
nano /var/www/enviro-backend/.env

# Update values:
EMAIL_PASSWORD=your_new_password
ZOHO_CLIENT_SECRET=your_new_secret
ZOHO_REFRESH_TOKEN=your_new_token

# Save: Ctrl+O, Enter, Ctrl+X

# Restart to apply changes
pm2 restart enviro-backend
```

---

## 🔐 Security

### Check Firewall Status
```bash
ssh root@YOUR_DROPLET_IP
ufw status
```

### View Failed Login Attempts
```bash
ssh root@YOUR_DROPLET_IP
grep "Failed password" /var/log/auth.log | tail -20
```

### Update Node.js
```bash
ssh root@YOUR_DROPLET_IP
npm install -g n
n latest
node --version  # Verify new version
pm2 restart enviro-backend
```

---

## 📊 Monitoring

### Real-Time Process Monitor
```bash
ssh root@YOUR_DROPLET_IP
pm2 monit
# Press Ctrl+C to exit
```

### View Detailed Info
```bash
ssh root@YOUR_DROPLET_IP
pm2 show enviro-backend
```

### View PM2 Dashboard (Web UI)
```bash
ssh root@YOUR_DROPLET_IP
pm2 plus  # Follow instructions to setup web dashboard
```

---

## 🌐 Frontend Configuration

### Update Frontend to Use Production Backend
```bash
# On your local machine
cd /Users/yaswanthgandhi/Documents/analytics/enviromaster
nano .env.production

# Update to:
VITE_API_BASE_URL=http://YOUR_DROPLET_IP:5000

# Rebuild
npm run build

# Deploy dist/ folder to frontend hosting
```

---

## 📞 Quick Support Checklist

When asking for help, provide:
1. PM2 logs: `pm2 logs enviro-backend --lines 100`
2. Server status: `pm2 status`
3. Server resources: `free -h && df -h`
4. .env check: `cat .env | grep -v PASSWORD | grep -v SECRET`
5. Node version: `node --version`
6. Error message from frontend console

---

## 💡 Pro Tips

1. **Always check logs first**: `pm2 logs enviro-backend`
2. **Restart fixes most issues**: `pm2 restart enviro-backend`
3. **Keep .env file secure**: Never commit to Git
4. **Monitor disk space**: Run `df -h` weekly
5. **Setup alerts**: Configure PM2 to email you on crashes
6. **Backup .env file**: Keep a copy in safe location

---

## 📱 Quick Access URLs

- **Backend Health**: `http://YOUR_DROPLET_IP:5000/health`
- **Zoho OAuth**: `http://YOUR_DROPLET_IP:5000/oauth/zoho/auth`
- **API Docs**: `http://YOUR_DROPLET_IP:5000/api/docs` (if enabled)
- **Digital Ocean Dashboard**: https://cloud.digitalocean.com

---

**Save this file for quick reference!** 📌
