# 🎉 ChainViz Successfully Deployed to AWS!

**Date:** October 12, 2025  
**Status:** ✅ LIVE AND RUNNING

---

## 🌐 Your Application is Live!

### Access Now (by IP):
**http://98.82.75.132**

### Access After DNS (by domain):
**http://utxo.link** (pending nameserver update)  
**https://utxo.link** (after SSL setup)

---

## 📊 Deployment Summary

### AWS Resources
- **EC2 Instance:** i-0df3ff5363c6514f5 (t3.medium, us-east-1)
- **Public IP:** 98.82.75.132 (Elastic IP)
- **Security Group:** sg-0f18d8d8d2c019de7
- **IAM Role:** ChainVizSSMRole (for remote management)

### Services Running
✅ **Backend:** FastAPI on port 8000  
✅ **Frontend:** React/Vite on port 5173  
✅ **Redis:** Cache on port 6379  
✅ **Nginx:** Reverse proxy on port 80/443  

### Verification
```bash
# Frontend is serving
curl http://98.82.75.132
# Returns: <title>ChainViz - Bitcoin Blockchain Analysis</title>

# Backend API is working
curl http://98.82.75.132/api/transaction/e3e15...
# Returns: JSON transaction data
```

---

## 🔑 DNS Setup (REQUIRED NEXT STEP)

### Route 53 Configuration (Already Done ✅)
- **Hosted Zone:** Z04049403ONZ8WKDI16QE
- **A Record:** utxo.link → 98.82.75.132
- **CNAME:** www.utxo.link → utxo.link

### Update Your Domain Registrar Nameservers

Go to where you registered `utxo.link` and update nameservers to:

```
ns-1171.awsdns-18.org
ns-993.awsdns-60.net
ns-1719.awsdns-22.co.uk
ns-110.awsdns-13.com
```

**Where to do this:**
- **Namecheap:** Domain List → Manage → Domain → Nameservers → Custom DNS
- **GoDaddy:** My Products → Domains → Manage DNS → Nameservers → Change
- **Route 53 Domains:** Already configured automatically!

**DNS Propagation Time:** 1-24 hours (usually < 1 hour)

### Verify DNS is Working

```bash
# Check if DNS resolves
dig utxo.link +short
# Should return: 98.82.75.132

# Test domain access
curl http://utxo.link
```

---

## 🔒 SSL Certificate Setup (After DNS Works)

Once DNS is resolving, get a free SSL certificate:

### Option A: Automated via SSM (I can do this)
Just tell me "get SSL certificate" after DNS works!

### Option B: Manual SSH
```bash
# 1. Install Session Manager plugin (if not installed)
brew install --cask session-manager-plugin

# 2. Connect via SSM (no SSH key needed!)
aws ssm start-session --target i-0df3ff5363c6514f5

# 3. Get SSL certificate
sudo certbot --nginx -d utxo.link -d www.utxo.link

# Follow prompts:
# - Email: your@email.com
# - Agree to terms: Y
# - Redirect HTTP to HTTPS: 2 (Yes)
```

**Certificate auto-renews every 90 days!**

---

## 📊 Monthly Costs

- **EC2 t3.medium:** ~$30.37/month
- **EBS 30GB gp3:** ~$2.40/month
- **Elastic IP:** $0 (free when attached)
- **Route 53 Hosted Zone:** $0.50/month
- **Route 53 Queries:** ~$0.40/million queries
- **Data Transfer:** $0.09/GB outbound

**Total:** ~$33-35/month + data transfer costs

---

## 🛠️ Management

### Remote Access (No SSH Key Needed!)

```bash
# Connect via Systems Manager
aws ssm start-session --target i-0df3ff5363c6514f5
```

### Check Services Status

```bash
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /home/ubuntu/ChainViz && sudo docker-compose ps"]'
```

### View Logs

```bash
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /home/ubuntu/ChainViz && sudo docker-compose logs backend --tail 50"]'
```

### Restart Services

```bash
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /home/ubuntu/ChainViz && sudo docker-compose restart"]'
```

### Update Application

```bash
aws ssm send-command \
  --instance-ids i-0df3ff5363c6514f5 \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=[
    "cd /home/ubuntu/ChainViz",
    "git pull origin main",
    "sudo docker-compose down",
    "sudo docker-compose up -d --build"
  ]'
```

---

## ✅ What's Working Right Now

1. **Frontend:** React app serving at http://98.82.75.132
2. **Backend API:** Responding at http://98.82.75.132/api
3. **Blockchain queries:** Connecting to Seth's Fulcrum server
4. **Redis caching:** Active for performance
5. **Auto-restart:** Services restart on failure or reboot

---

## 🎯 Timeline to Full Production

- **Now:** Working at http://98.82.75.132 ✅
- **1-24 hours:** DNS propagates, http://utxo.link works
- **After DNS:** Get SSL, https://utxo.link live with HTTPS

---

## 🚀 Next Actions

### Immediate (You can do now):
1. ✅ **Test the app:** http://98.82.75.132
2. ⏳ **Update domain nameservers** (at your registrar)

### After DNS Propagation:
3. Get SSL certificate (tell me "get SSL" or run certbot manually)
4. Access via https://utxo.link

---

## 📝 Important Info

**Instance ID:** i-0df3ff5363c6514f5  
**Public IP:** 98.82.75.132  
**Region:** us-east-1  
**Hosted Zone ID:** Z04049403ONZ8WKDI16QE  

**GitHub:** https://github.com/nostitos/ChainViz  
**Live Site (IP):** http://98.82.75.132  
**Live Site (Domain):** http://utxo.link (after DNS)  

---

## 🎉 Congratulations!

Your Bitcoin blockchain analysis platform **UTXO.link** is now live on AWS!

**Test it now:** http://98.82.75.132  
**Share it soon:** https://utxo.link (after DNS + SSL)

🚀✨




