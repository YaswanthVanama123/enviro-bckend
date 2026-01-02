#!/bin/bash

# EnviroMaster Backend - Digital Ocean Deployment Script
# Run this script on your Digital Ocean droplet after uploading code

set -e  # Exit on any error

echo "=================================================="
echo "  EnviroMaster Backend - Digital Ocean Setup"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Update system
echo -e "${YELLOW}Step 1: Updating system packages...${NC}"
apt update
apt upgrade -y
echo -e "${GREEN}✓ System updated${NC}"
echo ""

# Step 2: Install Node.js 20
echo -e "${YELLOW}Step 2: Installing Node.js 20...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
echo -e "${GREEN}✓ Node.js installed: $(node --version)${NC}"
echo -e "${GREEN}✓ NPM installed: $(npm --version)${NC}"
echo ""

# Step 3: Install PM2
echo -e "${YELLOW}Step 3: Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi
echo -e "${GREEN}✓ PM2 installed: $(pm2 --version)${NC}"
echo ""

# Step 4: Create application directory
echo -e "${YELLOW}Step 4: Creating application directory...${NC}"
mkdir -p /var/www/enviro-backend
cd /var/www/enviro-backend
echo -e "${GREEN}✓ Directory created: /var/www/enviro-backend${NC}"
echo ""

# Step 5: Check for .env file
echo -e "${YELLOW}Step 5: Checking environment configuration...${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo -e "${YELLOW}Please create .env file with your configuration.${NC}"
    echo -e "${YELLOW}See DIGITAL_OCEAN_DEPLOYMENT.md for details.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"
echo ""

# Step 6: Install dependencies
echo -e "${YELLOW}Step 6: Installing Node.js dependencies...${NC}"
echo "This may take a few minutes..."
npm install --production
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 7: Configure firewall
echo -e "${YELLOW}Step 7: Configuring firewall...${NC}"
ufw allow OpenSSH
ufw allow 5000
ufw --force enable
echo -e "${GREEN}✓ Firewall configured${NC}"
echo ""

# Step 8: Stop existing PM2 process (if any)
echo -e "${YELLOW}Step 8: Checking for existing PM2 processes...${NC}"
if pm2 list | grep -q enviro-backend; then
    echo "Stopping existing process..."
    pm2 stop enviro-backend
    pm2 delete enviro-backend
fi
echo -e "${GREEN}✓ Ready to start new process${NC}"
echo ""

# Step 9: Start application with PM2
echo -e "${YELLOW}Step 9: Starting application with PM2...${NC}"
pm2 start server.js --name enviro-backend
pm2 save
echo -e "${GREEN}✓ Application started${NC}"
echo ""

# Step 10: Setup PM2 auto-start
echo -e "${YELLOW}Step 10: Setting up PM2 auto-start...${NC}"
pm2 startup | grep -v "PM2" | bash
echo -e "${GREEN}✓ PM2 auto-start configured${NC}"
echo ""

# Step 11: Show status
echo -e "${YELLOW}Step 11: Checking application status...${NC}"
sleep 3  # Wait for app to start
pm2 status
echo ""

# Step 12: Show logs
echo -e "${YELLOW}Step 12: Showing recent logs...${NC}"
pm2 logs enviro-backend --lines 20 --nostream
echo ""

# Get server IP
SERVER_IP=$(curl -s http://checkip.amazonaws.com)

# Final summary
echo "=================================================="
echo -e "${GREEN}  Deployment Complete! 🎉${NC}"
echo "=================================================="
echo ""
echo "📍 Your backend is now running at:"
echo "   http://$SERVER_IP:5000"
echo ""
echo "🔍 Test health endpoint:"
echo "   curl http://$SERVER_IP:5000/health"
echo ""
echo "📊 View logs:"
echo "   pm2 logs enviro-backend"
echo ""
echo "🔄 Restart application:"
echo "   pm2 restart enviro-backend"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "   1. Update frontend .env.production with:"
echo "      VITE_API_BASE_URL=http://$SERVER_IP:5000"
echo ""
echo "   2. Update Zoho API Console redirect URI to:"
echo "      http://$SERVER_IP:5000/oauth/callback"
echo ""
echo "   3. Regenerate Zoho refresh token at:"
echo "      http://$SERVER_IP:5000/oauth/zoho/auth"
echo ""
echo "=================================================="
