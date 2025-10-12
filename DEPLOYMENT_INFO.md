# ChainViz AWS Deployment - LIVE INSTANCE

## 🚀 Deployment Complete!

**Date:** October 12, 2025  
**Status:** Infrastructure provisioned, ready for application deployment

---

## 📊 AWS Resources Created

### EC2 Instance
- **Instance ID:** `i-039e91e5972d71428`
- **Type:** t3.medium (2 vCPU, 4GB RAM)
- **OS:** Ubuntu 22.04 LTS
- **Storage:** 30GB gp3 SSD
- **Region:** us-east-1
- **Public IP:** **98.82.75.132**
- **Name:** utxo-link-server

### Security Group
- **ID:** `sg-0f18d8d8d2c019de7`
- **Inbound Rules:**
  - SSH (22) from anywhere
  - HTTP (80) from anywhere
  - HTTPS (443) from anywhere

### Elastic IP
- **Address:** **98.82.75.132**
- **Allocation ID:** `eipalloc-0cb2df75b5662368f`
- **Associated with:** i-039e91e5972d71428

### Route 53 DNS
- **Hosted Zone ID:** `Z04049403ONZ8WKDI16QE`
- **Domain:** utxo.link
- **Nameservers:**
  - ns-1171.awsdns-18.org
  - ns-993.awsdns-60.net
  - ns-1719.awsdns-22.co.uk
  - ns-110.awsdns-13.com

### DNS Records
- **A Record:** utxo.link → 98.82.75.132
- **CNAME Record:** www.utxo.link → utxo.link

---

## 🔑 SSH Access

```bash
ssh -i ~/.ssh/Rootyapapiserverstagingcore-env-ssh.pem ubuntu@98.82.75.132
```

---

## ⚡ Next Steps (REQUIRED)

### Step 1: Update Domain Nameservers (CRITICAL!)

Go to your domain registrar where you own `utxo.link` and update the nameservers to:

```
ns-1171.awsdns-18.org
ns-993.awsdns-60.net
ns-1719.awsdns-22.co.uk
ns-110.awsdns-13.com
```

**If domain is on:**
- **Namecheap:** Domain List → Manage → Domain → Nameservers → Custom DNS
- **GoDaddy:** DNS → Nameservers → Change → Custom
- **Route 53:** Already configured!

**DNS propagation:** 1-24 hours (usually <1 hour)

---

### Step 2: Deploy Application to EC2

SSH to the server:
```bash
ssh -i ~/.ssh/Rootyapapiserverstagingcore-env-ssh.pem ubuntu@98.82.75.132
```

Run the deployment script:
```bash
cd ~
curl -o setup.sh https://raw.githubusercontent.com/nostitos/ChainViz/main/deployment/ec2-setup.sh
chmod +x setup.sh
./setup.sh
```

**OR** manually:
```bash
git clone https://github.com/nostitos/ChainViz.git
cd ChainViz
./deployment/ec2-setup.sh
```

This will:
- Install Docker, Nginx, Certbot
- Build and start ChainViz
- Configure reverse proxy
- Set up auto-restart

---

### Step 3: Get SSL Certificate (After DNS Propagates)

Once DNS is working (test with `dig utxo.link`):

```bash
# SSH to server
ssh -i ~/.ssh/Rootyapapiserverstagingcore-env-ssh.pem ubuntu@98.82.75.132

# Get SSL certificate
sudo certbot --nginx -d utxo.link -d www.utxo.link
```

Follow prompts:
1. Enter email
2. Agree to terms (Y)
3. Redirect HTTP to HTTPS? (2 - Yes)

**Certificate auto-renews every 90 days!**

---

## ✅ Verification

### Test by IP (Immediate):
```bash
curl http://98.82.75.132
```

### Test by Domain (After DNS):
```bash
# Check DNS
dig utxo.link +short
# Should return: 98.82.75.132

# Test HTTP
curl http://utxo.link

# Test HTTPS (after SSL)
curl https://utxo.link
```

### Visit in Browser:
- **By IP:** http://98.82.75.132
- **By domain:** https://utxo.link (after DNS + SSL)

---

## 📊 Monthly Costs

- **EC2 t3.medium:** ~$30/month (730 hours × $0.0416/hour)
- **Elastic IP:** $0 (free when attached)
- **Route 53 Hosted Zone:** $0.50/month
- **Route 53 Queries:** $0.40 per million (~$0.01/month for low traffic)
- **Data transfer:** $0.09/GB outbound
- **EBS Storage:** $2.40/month (30GB × $0.08/GB)

**Total: ~$33/month** + data transfer

---

## 🛠️ Management Commands

### Check Services Status:
```bash
ssh ubuntu@98.82.75.132
cd ~/ChainViz
sudo docker-compose ps
```

### View Logs:
```bash
sudo docker-compose logs -f backend
sudo docker-compose logs -f frontend
```

### Restart Services:
```bash
sudo docker-compose restart
```

### Update Application:
```bash
cd ~/ChainViz
git pull origin main
sudo docker-compose down
sudo docker-compose up -d --build
```

### Monitor Resources:
```bash
htop  # CPU/Memory
df -h # Disk space
```

---

## 🔧 Troubleshooting

### Can't SSH?
- Check security group allows SSH from your IP
- Verify you're using the correct key file
- Check instance is running: `aws ec2 describe-instances --instance-ids i-039e91e5972d71428`

### Domain not resolving?
```bash
dig utxo.link NS  # Check nameservers
dig utxo.link A   # Check A record
```

### Application not running?
```bash
ssh ubuntu@98.82.75.132
sudo docker-compose logs
sudo systemctl status nginx
```

---

## 📝 Important Files Locations on EC2

- **Application:** `/home/ubuntu/ChainViz`
- **Nginx config:** `/etc/nginx/sites-available/utxo.link`
- **SSL certs:** `/etc/letsencrypt/live/utxo.link/`
- **Logs:** `/home/ubuntu/ChainViz/backend.log`

---

## 🔄 Auto-Renewal

- **SSL Certificate:** Auto-renews via certbot (check: `sudo certbot renew --dry-run`)
- **Docker containers:** Set to `restart: always` in docker-compose.yml

---

## Summary

✅ Infrastructure ready  
✅ DNS configured  
⏳ Application deployment pending (SSH required)  
⏳ SSL pending (after DNS propagation)  

**Your server IP:** 98.82.75.132  
**Your domain:** utxo.link (pending nameserver update)

---

## 🎯 Final Steps You Need to Do:

1. **Update domain nameservers** (at your registrar)
2. **SSH to server** and run deployment script
3. **Get SSL certificate** (after DNS works)
4. **Visit https://utxo.link** 🎉

Everything else is automated!

