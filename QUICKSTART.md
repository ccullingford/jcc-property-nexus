# Quick Start Guide - AWS Deployment

This guide will get your application deployed to AWS in under 30 minutes.

## Prerequisites Checklist

- [ ] AWS Account with admin access
- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] GitHub repository created
- [ ] Node.js 20.x installed locally

## Step-by-Step Deployment

### 1. Initial Setup (5 minutes)

```bash
# Clone and setup
git clone <your-repo-url>
cd property-management-app
npm install

# Copy environment template
cp .env.example .env
```

### 2. Choose Your Deployment Method

#### Option A: Elastic Beanstalk (Recommended for beginners)

**Pros**: Easiest setup, managed infrastructure, auto-scaling
**Cons**: Less control, slightly higher cost

```bash
# Run the setup script
./scripts/setup-aws.sh
# Choose option 1 for Elastic Beanstalk
```

#### Option B: ECS/Fargate (Recommended for production)

**Pros**: Better scaling, container-based, more control
**Cons**: More complex setup

```bash
# Run the setup script
./scripts/setup-aws.sh
# Choose option 2 for ECS
```

### 3. Create Database (10 minutes)

#### Using AWS Console:
1. Go to RDS → Create database
2. Choose PostgreSQL 16.x
3. Select template: Production or Dev/Test
4. Instance: db.t3.micro (free tier eligible)
5. Set master username and password
6. Enable public access (for initial setup)
7. Create database

#### Using Terraform (Automated):
```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Review what will be created
terraform plan

# Create infrastructure
terraform apply
```

**Save the database endpoint URL!** You'll need it in the next step.

### 4. Configure GitHub Secrets (5 minutes)

Go to your GitHub repository:
1. Settings → Secrets and variables → Actions
2. Click "New repository secret"

Add these secrets:

| Secret Name | Value | How to Get |
|------------|-------|------------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key | IAM → Users → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key | IAM → Users → Security credentials |
| `EB_S3_BUCKET` | S3 bucket name | From setup script output |

### 5. Configure Environment Variables in AWS

#### For Elastic Beanstalk:
```bash
aws elasticbeanstalk update-environment \
  --application-name property-management-app \
  --environment-name property-management-env \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value="postgresql://user:pass@host:5432/db" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SESSION_SECRET,Value="$(openssl rand -base64 32)" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production
```

#### For ECS:
Store secrets in AWS Secrets Manager:
```bash
aws secretsmanager create-secret \
  --name property-management/DATABASE_URL \
  --secret-string "postgresql://user:pass@host:5432/db"

aws secretsmanager create-secret \
  --name property-management/SESSION_SECRET \
  --secret-string "$(openssl rand -base64 32)"
```

### 6. Deploy! (5 minutes)

```bash
# Commit and push to trigger deployment
git add .
git commit -m "Initial deployment"
git push origin main
```

Watch the deployment in GitHub Actions:
- Go to your repository → Actions tab
- Click on the running workflow
- Monitor the deployment progress

### 7. Initialize Database (2 minutes)

Once deployed, run migrations:

#### For Elastic Beanstalk:
```bash
# SSH into the instance
eb ssh property-management-env

# Run migrations
cd /var/app/current
npm run db:push
exit
```

#### For ECS:
```bash
# Use ECS Exec or run a one-time task
aws ecs run-task \
  --cluster property-management-cluster \
  --task-definition property-management-task \
  --overrides '{"containerOverrides":[{"name":"property-management-app","command":["npm","run","db:push"]}]}'
```

### 8. Verify Deployment (2 minutes)

```bash
# Get your application URL
# For Elastic Beanstalk:
aws elasticbeanstalk describe-environments \
  --application-name property-management-app \
  --environment-names property-management-env \
  --query 'Environments[0].CNAME' \
  --output text

# Test health endpoint
curl https://your-app-url.elasticbeanstalk.com/health
```

Expected response:
```json
{"status":"healthy","timestamp":"2024-03-08T12:00:00.000Z"}
```

## Post-Deployment

### Create First User

Access your application URL and create an admin user through the UI, or use the API:

```bash
curl -X POST https://your-app-url/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin User",
    "email": "admin@yourcompany.com",
    "password": "secure-password",
    "role": "admin"
  }'
```

### Enable HTTPS

1. Go to AWS Certificate Manager
2. Request a certificate for your domain
3. Add the certificate to your load balancer
4. Update your DNS to point to the load balancer

### Set Up Monitoring

```bash
# Enable CloudWatch alarms
aws cloudwatch put-metric-alarm \
  --alarm-name high-cpu-usage \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

## Troubleshooting

### Deployment Failed

1. Check GitHub Actions logs for errors
2. Verify all secrets are set correctly
3. Ensure DATABASE_URL is accessible from AWS

### Application Won't Start

```bash
# Check logs
# For Elastic Beanstalk:
eb logs

# For ECS:
aws logs tail /ecs/property-management --follow
```

### Database Connection Error

1. Verify DATABASE_URL format: `postgresql://user:pass@host:5432/dbname`
2. Check security group allows connections from app
3. Ensure database is in same VPC or publicly accessible

### Can't Access Application

1. Check security group allows inbound traffic on port 80/443
2. Verify load balancer health checks are passing
3. Ensure environment variables are set

## Cost Estimate

### Minimal Setup (Development)
- EC2 t3.micro: ~$8/month
- RDS db.t3.micro: ~$15/month
- Data transfer: ~$5/month
**Total: ~$28/month**

### Production Setup
- EC2 t3.small (2x): ~$30/month
- RDS db.t3.small: ~$30/month
- Load Balancer: ~$20/month
- Redis cache.t3.micro: ~$15/month
**Total: ~$95/month**

## Next Steps

- [ ] Set up custom domain
- [ ] Enable HTTPS
- [ ] Configure auto-scaling
- [ ] Set up CloudWatch monitoring
- [ ] Enable automated backups
- [ ] Configure Microsoft Graph integration (optional)
- [ ] Set up CI/CD for staging environment

## Support

- Full documentation: [DEPLOYMENT.md](./DEPLOYMENT.md)
- AWS Documentation: https://docs.aws.amazon.com
- GitHub Issues: Create an issue in this repository

## Rollback

If something goes wrong:

```bash
# For Elastic Beanstalk:
aws elasticbeanstalk update-environment \
  --environment-name property-management-env \
  --version-label <previous-version>

# For ECS:
aws ecs update-service \
  --cluster property-management-cluster \
  --service property-management-service \
  --task-definition property-management-task:<previous-revision>
```

---

**Congratulations!** 🎉 Your application is now running on AWS!
