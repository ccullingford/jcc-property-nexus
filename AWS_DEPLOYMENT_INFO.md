# AWS Deployment Information

## Deployment Status: IN PROGRESS ⏳

Your AWS infrastructure is being created. This typically takes 10-15 minutes.

---

## Created Resources

### Elastic Beanstalk
- **Application Name**: property-management-app
- **Environment Name**: property-management-env
- **Environment ID**: e-d3yqmf9kmj
- **Region**: us-east-1
- **Platform**: Node.js 20 on Amazon Linux 2023
- **Instance Type**: t3.small
- **Status**: Launching (check status below)

### RDS PostgreSQL Database
- **Instance ID**: property-management-db
- **Engine**: PostgreSQL 16.6
- **Instance Class**: db.t3.micro
- **Database Name**: propertymanagement
- **Master Username**: dbadmin
- **Master Password**: (65H$2v:5T#88=tMQK%Vzycn
- **Storage**: 20 GB (auto-scaling enabled)
- **Backup Retention**: 7 days
- **Status**: Creating (takes 5-10 minutes)

### S3 Deployment Bucket
- **Bucket Name**: property-management-deployments-1772952264
- **Region**: us-east-1
- **Purpose**: Stores application deployment packages

### Security Groups
- **RDS Security Group**: sg-08ace5edc92319e4e
- **Allows**: PostgreSQL (port 5432) from anywhere (will be restricted later)

---

## Check Deployment Status

### Check Elastic Beanstalk Status
```bash
aws elasticbeanstalk describe-environments \
  --application-name property-management-app \
  --environment-names property-management-env \
  --region us-east-1 \
  --query 'Environments[0].[Status,Health,CNAME]' \
  --output table
```

### Check RDS Status
```bash
aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address,Endpoint.Port]' \
  --output table
```

### Get Database Endpoint (once available)
```bash
aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

---

## Next Steps

### 1. Wait for Resources to be Ready (10-15 minutes)

Monitor the status with the commands above. Wait until:
- Elastic Beanstalk Status: `Ready`
- Elastic Beanstalk Health: `Green` or `Yellow`
- RDS Status: `available`

### 2. Get Database Connection String

Once RDS is available, get the endpoint:
```bash
DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

echo "DATABASE_URL=postgresql://dbadmin:(65H\$2v:5T#88=tMQK%Vzycn@$DB_ENDPOINT:5432/propertymanagement"
```

### 3. Configure Environment Variables

Update Elastic Beanstalk with the database URL and session secret:

```bash
# Get the database endpoint first
DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Generate a session secret
SESSION_SECRET=$(openssl rand -base64 32)

# Update environment variables
aws elasticbeanstalk update-environment \
  --application-name property-management-app \
  --environment-name property-management-env \
  --region us-east-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value="postgresql://dbadmin:(65H\$2v:5T#88=tMQK%Vzycn@$DB_ENDPOINT:5432/propertymanagement" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SESSION_SECRET,Value="$SESSION_SECRET"
```

### 4. Set Up GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Value |
|------------|-------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret access key |
| `EB_S3_BUCKET` | property-management-deployments-1772952264 |

### 5. Update GitHub Workflow

The workflow file `.github/workflows/deploy.yml` is already configured with:
- AWS_REGION: us-east-1
- EB_APPLICATION_NAME: property-management-app
- EB_ENVIRONMENT_NAME: property-management-env

No changes needed!

### 6. Deploy Your Application

```bash
# Make sure all changes are committed
git add .
git commit -m "Ready for deployment"

# Push to GitHub (triggers automatic deployment)
git push origin main
```

### 7. Initialize Database Schema

After the first deployment, SSH into the instance and run migrations:

```bash
# Install EB CLI if you haven't
pip install awsebcli

# SSH into the instance
eb ssh property-management-env --region us-east-1

# Run database migrations
cd /var/app/current
npm run db:push

# Exit
exit
```

Or use AWS Systems Manager Session Manager to connect.

### 8. Access Your Application

Get your application URL:
```bash
aws elasticbeanstalk describe-environments \
  --application-name property-management-app \
  --environment-names property-management-env \
  --region us-east-1 \
  --query 'Environments[0].CNAME' \
  --output text
```

Your app will be available at: `http://<CNAME>.elasticbeanstalk.com`

Test the health endpoint:
```bash
curl http://<CNAME>.elasticbeanstalk.com/health
```

---

## Security Improvements (Do After Initial Setup)

### 1. Restrict RDS Security Group

Update the security group to only allow access from the Elastic Beanstalk instances:

```bash
# Get the EB security group
EB_SG=$(aws elasticbeanstalk describe-configuration-settings \
  --application-name property-management-app \
  --environment-name property-management-env \
  --region us-east-1 \
  --query 'ConfigurationSettings[0].OptionSettings[?OptionName==`SecurityGroups`].Value' \
  --output text)

# Remove the open rule
aws ec2 revoke-security-group-ingress \
  --group-id sg-08ace5edc92319e4e \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0 \
  --region us-east-1

# Add restricted rule
aws ec2 authorize-security-group-ingress \
  --group-id sg-08ace5edc92319e4e \
  --protocol tcp \
  --port 5432 \
  --source-group $EB_SG \
  --region us-east-1
```

### 2. Enable HTTPS

1. Request an SSL certificate in AWS Certificate Manager
2. Add the certificate to your load balancer
3. Update your application to redirect HTTP to HTTPS

### 3. Set Up Custom Domain

1. Register or use existing domain
2. Create Route 53 hosted zone
3. Add CNAME record pointing to your EB environment

---

## Cost Estimate

### Monthly Costs (Approximate)
- **EC2 t3.small**: ~$15/month
- **RDS db.t3.micro**: ~$15/month
- **Application Load Balancer**: ~$20/month
- **Data Transfer**: ~$5/month
- **S3 Storage**: <$1/month
- **CloudWatch Logs**: ~$2/month

**Total**: ~$58/month

### Cost Optimization Tips
- Use Reserved Instances for 30-40% savings
- Enable auto-scaling to scale down during low traffic
- Use RDS snapshots instead of continuous backups for dev
- Delete old application versions from S3

---

## Monitoring

### View Logs
```bash
# Recent logs
aws elasticbeanstalk retrieve-environment-info \
  --environment-name property-management-env \
  --info-type tail \
  --region us-east-1

# Or use EB CLI
eb logs property-management-env --region us-east-1
```

### CloudWatch Metrics
Go to AWS Console → CloudWatch → Dashboards to view:
- CPU utilization
- Network traffic
- Request count
- Response time
- Database connections

---

## Troubleshooting

### Environment Won't Start
1. Check logs: `eb logs property-management-env`
2. Verify all environment variables are set
3. Check that the build completed successfully

### Database Connection Errors
1. Verify DATABASE_URL is correct
2. Check security group allows connections
3. Ensure database is in `available` status

### Deployment Fails
1. Check GitHub Actions logs
2. Verify AWS credentials are correct
3. Ensure S3 bucket exists and is accessible

---

## Useful Commands

```bash
# Check environment health
aws elasticbeanstalk describe-environment-health \
  --environment-name property-management-env \
  --attribute-names All \
  --region us-east-1

# View recent events
aws elasticbeanstalk describe-events \
  --environment-name property-management-env \
  --region us-east-1 \
  --max-items 20

# Restart application servers
aws elasticbeanstalk restart-app-server \
  --environment-name property-management-env \
  --region us-east-1

# Terminate environment (when done testing)
aws elasticbeanstalk terminate-environment \
  --environment-name property-management-env \
  --region us-east-1
```

---

## Support

- AWS Elastic Beanstalk Docs: https://docs.aws.amazon.com/elasticbeanstalk/
- AWS RDS Docs: https://docs.aws.amazon.com/rds/
- Project Documentation: See DEPLOYMENT.md and QUICKSTART.md

---

**Status**: Resources are being created. Check back in 10-15 minutes!
