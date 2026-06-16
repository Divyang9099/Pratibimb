#!/usr/bin/env bash
# One-time provisioning for the Tower Tracker / Pratibimb backend on a fresh
# Ubuntu EC2 instance. Run it ON the server, from the repo root, e.g.:
#
#   cd ~/Pratibimb && bash deploy/setup-ec2.sh
#
# Safe to re-run: it upgrades packages and restarts the app via PM2.
set -euo pipefail

APP_NAME="tower-api"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backend"
DOMAIN="api.varunaat.in"

echo "==> Installing Node.js 20, git, nginx, pm2 ..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
fi
sudo apt-get update
sudo apt-get install -y nodejs git nginx
sudo npm install -g pm2

echo "==> Installing backend dependencies ..."
cd "$APP_DIR"
npm install --omit=dev

if [ ! -f "$APP_DIR/.env" ]; then
  echo "!! No backend/.env found."
  echo "!! Create it (MONGO_URI, JWT_SECRET, PORT=5050, CORS_ORIGINS, Cloudinary)"
  echo "!! then re-run this script. See deploy/env.production.example."
  exit 1
fi

echo "==> Starting app under PM2 ..."
pm2 start src/server.js --name "$APP_NAME" || pm2 restart "$APP_NAME"
pm2 save
sudo env PATH=$PATH pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | bash || true

echo "==> Configuring nginx reverse proxy ..."
sudo cp "$(dirname "$0")/nginx-tower-api.conf" /etc/nginx/sites-available/tower-api
sudo ln -sf /etc/nginx/sites-available/tower-api /etc/nginx/sites-enabled/tower-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "==> Backend is now running behind nginx on http://$DOMAIN"
echo "==> Next: point DNS A-record $DOMAIN -> this server's public IP,"
echo "    then enable HTTPS with:"
echo "      sudo apt-get install -y certbot python3-certbot-nginx"
echo "      sudo certbot --nginx -d $DOMAIN"
echo ""
echo "Check logs with:  pm2 logs $APP_NAME"
