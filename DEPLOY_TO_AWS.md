# Deploy UTXO.link to AWS - Quick Start

## 🚀 Fastest Path to Production

### Step 1: Launch EC2 Instance (5 minutes)

```bash
# Option A: AWS Console (Easiest)
1. Go to AWS EC2 Console
2. Click "Launch Instance"
3. Choose:
   - Name: utxo-link-server
   - AMI: Ubuntu 22.04 LTS
   - Instance type: t3.medium
   - Key pair: Create new or use existing
   - Storage: 30GB gp3
4. Launch!
```

**Option B: AWS CLI:**
```bash
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name your-key \
  --security-groups chainviz-sg \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=utxo-link}]'
```

### Step 2: Allocate Elastic IP (2 minutes)

```bash
# AWS Console: EC2 → Elastic IPs → Allocate → Associate with instance
# OR
aws ec2 allocate-address --domain vpc
aws ec2 associate-address --instance-id i-xxx --allocation-id eipalloc-xxx
```

**Save this IP!** You'll need it for DNS.

---

### Step 3: Configure DNS (5 minutes)

#### If you own utxo.link already:

**Route 53:**
```bash
# 1. Create hosted zone
aws route53 create-hosted-zone --name utxo.link --caller-reference $(date +%s)

# 2. Note the 4 nameservers

# 3. Create A record pointing to your Elastic IP
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123... \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "utxo.link",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{"Value": "YOUR_ELASTIC_IP"}]
      }
    }]
  }'
```

#### Update your domain registrar:

Go to your domain registrar (Namecheap, GoDaddy, etc.) and change nameservers to:
```
ns-123.awsdns-12.com
ns-456.awsdns-45.net
ns-789.awsdns-78.org
ns-012.awsdns-01.co.uk
```

(Use the actual nameservers from Route 53!)

---

### Step 4: Deploy Application (10 minutes)

SSH to your EC2 instance:
```bash
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

Run the deployment script:
```bash
# Clone repository
git clone https://github.com/nostitos/ChainViz.git
cd ChainViz

# Run automated deployment
./deployment/deploy.sh
```

This script will:
- ✅ Install Docker, Docker Compose, Nginx, Certbot
- ✅ Build and start the application
- ✅ Configure Nginx reverse proxy
- ✅ Set up services to auto-restart

---

### Step 5: Get SSL Certificate (2 minutes)

```bash
sudo certbot --nginx -d utxo.link -d www.utxo.link
```

Follow prompts:
1. Enter your email
2. Agree to terms (Y)
3. Share email? (N)
4. Redirect HTTP to HTTPS? (2 - Yes, recommended)

**Done!** Certificate auto-renews every 90 days.

---

## Verify Deployment

### Check Services:
```bash
docker-compose ps
# Should show: backend (up), frontend (up), redis (up)
```

### Test API:
```bash
curl http://localhost:8000/api/transaction/e3e15cbf034458a9a53104512ee81013d3954d202abdcaf191c8a70cb66e350e
# Should return JSON
```

### Test Frontend:
```bash
curl http://localhost:5173
# Should return HTML
```

### Test Domain:
```bash
curl https://utxo.link
# Should show the app!
```

---

## Total Time: ~25 minutes

- EC2 setup: 5 min
- Elastic IP: 2 min
- DNS configuration: 5 min
- Application deployment: 10 min
- SSL certificate: 2 min
- **Total: ~25 minutes to live!**

---

## Monthly Costs

**Minimum setup:**
- EC2 t3.medium: $30/month
- Data transfer: ~$5-10/month
- Route 53: $0.50/month
- **Total: ~$35-40/month**

**Free tier eligible** (first 12 months):
- 750 hours/month t3.micro (smaller instance)
- Can run for FREE for a year on t3.micro!

---

## Alternative: AWS Lightsail (Simpler!)

**Even easier deployment:**

```bash
# 1. Create Lightsail instance ($10/month)
aws lightsail create-instances \
  --instance-names utxo-link \
  --blueprint-id ubuntu_22_04 \
  --bundle-id medium_2_0

# 2. Attach static IP
aws lightsail allocate-static-ip --static-ip-name utxo-link-ip
aws lightsail attach-static-ip --static-ip-name utxo-link-ip --instance-name utxo-link

# 3. SSH and deploy
ssh ubuntu@YOUR_LIGHTSAIL_IP
git clone https://github.com/nostitos/ChainViz.git
cd ChainViz && ./deployment/deploy.sh
```

**Benefits:**
- Fixed $10/month pricing (no surprises)
- Simpler networking
- Includes 2TB data transfer
- Perfect for getting started!

---

## DNS Setup Summary

1. **AWS Route 53:**
   - Create hosted zone for `utxo.link`
   - Create A record: `utxo.link` → `YOUR_ELASTIC_IP`
   - Create CNAME: `www.utxo.link` → `utxo.link`

2. **Domain Registrar:**
   - Update nameservers to AWS Route 53 nameservers
   - Wait 1-24 hours for propagation

3. **Verify:**
   ```bash
   dig utxo.link +short
   # Should return your Elastic IP
   ```

---

## Need Help?

- **Full guide:** See `AWS_DEPLOYMENT_GUIDE.md`
- **Terraform automation:** Let me know if you want Infrastructure as Code
- **GitHub Actions CI/CD:** Automated deployments on git push
- **CloudFront CDN:** For global performance

Ready to deploy? Let me know if you want me to:
1. Create Terraform files for automated infrastructure
2. Set up GitHub Actions for CI/CD
3. Create CloudFormation templates
4. Generate SSL setup scripts

Good luck with the deployment! 🚀

