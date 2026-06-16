# Deploying the Pratibimb backend to EC2

The backend (Express + Socket.io + MongoDB) runs on the EC2 instance under
PM2, behind an Nginx reverse proxy, reachable at `https://pratibimb.varunaat.in`.
The three React frontends stay on your existing host and just point their
`VITE_API_URL` at that domain.

## 1. EC2 Security Group inbound rules
Open ports **22** (SSH, your IP), **80** (HTTP), **443** (HTTPS). Port 5050
stays internal — Nginx fronts it.

## 2. DNS (in the varunaat.in control panel)
Add an A record:  `api`  ->  `<EC2 public IP>`  (use an Elastic IP so it never
changes).

## 3. SSH in (from the project root on Windows)
```powershell
icacls "pratibimbapi.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i "pratibimbapi.pem" ubuntu@<EC2 public IP>
```

## 4. Clone + provision (on the server)
```bash
git clone https://github.com/Divyang9099/Pratibimb.git ~/Pratibimb
cd ~/Pratibimb
cp deploy/env.production.example backend/.env
nano backend/.env          # fill MONGO_URI, JWT_SECRET, CORS_ORIGINS, Cloudinary
bash deploy/setup-ec2.sh   # installs node/nginx/pm2, starts app, configures nginx
```

Also: in MongoDB Atlas -> Network Access, allow the EC2 public IP.

## 5. HTTPS
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pratibimb.varunaat.in
```

## 6. Verify
```bash
curl https://pratibimb.varunaat.in/api/health     # -> {"ok":true,...}
```

## 7. Point the frontends at the new backend
In each of `client-app`, `pilot-app`, `admin-app`, set `.env.production`:
```
VITE_API_URL=https://pratibimb.varunaat.in/api
```
Rebuild (`npm run build`) and re-upload each `dist/` to your host.

## Redeploying later (after pushing code changes)
```bash
cd ~/Pratibimb && git pull
cd backend && npm install --omit=dev
pm2 restart tower-api
```
