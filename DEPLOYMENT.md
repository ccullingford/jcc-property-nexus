# AWS Deployment Guide

This guide covers deploying the Property Management application to AWS.

## Prerequisites

1. AWS Account with appropriate permissions
2. GitHub repository set up
3. AWS CLI installed locally (for initial setup)

## Deployment Options

We've configured three deployment options:

### Option 1: AWS Elastic Beanstalk (Recommended for simplicity)
### Option 2: AWS ECS with Fargate (Recommended for scalability)
### Option 3: Manual EC2 deployment

---

## Option 1: Elastic Beanstalk Deployment

### Initial Setup

1. **Create Elastic Beanstalk Application**
   ```bash
   aws elasticbeanstalk create-application \
     --application-name property-management-app \
     --description "Property Management Application"
   ```

2. **Create S3 Bucket for Deployments**
   ```bash
   aws s3 mb s3://property-management-deployments-$(date +%s)
   ```

3. **Create RDS PostgreSQL Database**
   ```bash
   # Use Terraform (see infrastructure/terraform/) or AWS Console
   # Note the DATABASE_URL after creation
   ```

4. **Create Elastic Beanstalk Environment**
   ```bash
   aws elasticbeanstalk create-environment \
     --application-name property-management-app \
     --environment-name property-management-env \
     --solution-stack-name "64bit Amazon Linux 2023 v6.1.0 running Node.js 20" \
     --option-settings \
       Namespace=aws:autoscaling:launchconfiguration,OptionName=InstanceType,Value=t3.small \
       Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production \
       Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value=YOUR_DATABASE_URL \
       Namespace=aws:elasticbeanstalk:application:environment,OptionName=SESSION_SECRET,Value=YOUR_SESSION_SECRET
   ```

5. **Configure GitHub Secrets**
   
   Go to your GitHub repository → Settings → Secrets and variables → Actions
   
   Add these secrets:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
   - `EB_S3_BUCKET`: S3 bucket name from step 2

6. **Update Workflow File**
   
   Edit `.github/workflows/deploy.yml` and update:
   - `AWS_REGION`: Your preferred region
   - `EB_APPLICATION_NAME`: Your application name
   - `EB_ENVIRONMENT_NAME`: Your environment name

7. **Push to Deploy**
   ```bash
   git add .
   git commit -m "Setup AWS deployment"
   git push origin main
   ```

---

## Option 2: ECS/Fargate Deployment

### Initial Setup

1. **Create ECR Repository**
   ```bash
   aws ecr create-repository \
     --repository-name property-management-app \
     --region us-east-1
   ```

2. **Create ECS Cluster**
   ```bash
   aws ecs create-cluster \
     --cluster-name property-management-cluster \
     --region us-east-1
   ```

3. **Set up Infrastructure with Terraform**
   ```bash
   cd infrastructure/terraform
   terraform init
   terraform plan
   terraform apply
   ```

4. **Create Task Definition**
   
   Create a file `task-definition.json`:
   ```json
   {
     "family": "property-management-task",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "512",
     "memory": "1024",
     "containerDefinitions": [
       {
         "name": "property-management-app",
         "image": "YOUR_ECR_REPO_URI:latest",
         "portMappings": [
           {
             "containerPort": 5000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "NODE_ENV",
             "value": "production"
           },
           {
             "name": "PORT",
             "value": "5000"
           }
         ],
         "secrets": [
           {
             "name": "DATABASE_URL",
             "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:DATABASE_URL"
           },
           {
             "name": "SESSION_SECRET",
             "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:SESSION_SECRET"
           }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/property-management",
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

5. **Register Task Definition**
   ```bash
   aws ecs register-task-definition \
     --cli-input-json file://task-definition.json
   ```

6. **Create ECS Service**
   ```bash
   aws ecs create-service \
     --cluster property-management-cluster \
     --service-name property-management-service \
     --task-definition property-management-task \
     --desired-count 2 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
   ```

7. **Configure GitHub Secrets**
   
   Add these secrets to GitHub:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

8. **Enable ECS Workflow**
   
   Rename or use `.github/workflows/deploy-ecs.yml` instead of `deploy.yml`

---

## Environment Variables

Configure these in your AWS environment:

### Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Random string for session encryption
- `NODE_ENV`: Set to "production"
- `PORT`: Application port (5000 or 8080 for EB)

### Optional (Microsoft Graph Integration)
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `ALLOWED_EMAIL_DOMAIN`

---

## Database Migration

After deployment, run migrations:

```bash
# SSH into your instance or use ECS Exec
npm run db:push
```

Or set up a one-time ECS task to run migrations automatically.

---

## Monitoring and Logs

### Elastic Beanstalk
```bash
aws elasticbeanstalk describe-environment-health \
  --environment-name property-management-env \
  --attribute-names All
```

### ECS
```bash
aws logs tail /ecs/property-management --follow
```

---

## Scaling

### Elastic Beanstalk
Configure auto-scaling in the EB console or via CLI:
```bash
aws elasticbeanstalk update-environment \
  --environment-name property-management-env \
  --option-settings \
    Namespace=aws:autoscaling:asg,OptionName=MinSize,Value=2 \
    Namespace=aws:autoscaling:asg,OptionName=MaxSize,Value=4
```

### ECS
```bash
aws ecs update-service \
  --cluster property-management-cluster \
  --service property-management-service \
  --desired-count 3
```

---

## Troubleshooting

### Check Application Logs
- **EB**: AWS Console → Elastic Beanstalk → Logs
- **ECS**: CloudWatch Logs → /ecs/property-management

### Common Issues

1. **Database Connection Failed**
   - Verify DATABASE_URL is correct
   - Check security group allows connections from app
   - Ensure RDS is in same VPC or accessible

2. **Build Fails**
   - Check Node.js version matches (20.x)
   - Verify all dependencies are in package.json
   - Review GitHub Actions logs

3. **Application Won't Start**
   - Check environment variables are set
   - Verify dist/index.cjs exists after build
   - Review application logs

---

## Cost Optimization

- Use t3.micro/small instances for development
- Enable auto-scaling to scale down during low traffic
- Use RDS snapshots instead of continuous backups for dev
- Consider Aurora Serverless for variable workloads

---

## Security Checklist

- [ ] Enable HTTPS/SSL certificate
- [ ] Rotate SESSION_SECRET regularly
- [ ] Use AWS Secrets Manager for sensitive data
- [ ] Enable RDS encryption at rest
- [ ] Configure security groups with minimal access
- [ ] Enable CloudWatch alarms for monitoring
- [ ] Set up AWS WAF for DDoS protection
- [ ] Enable VPC Flow Logs
- [ ] Use IAM roles instead of access keys where possible

---

## Rollback

### Elastic Beanstalk
```bash
aws elasticbeanstalk update-environment \
  --environment-name property-management-env \
  --version-label PREVIOUS_VERSION_LABEL
```

### ECS
```bash
aws ecs update-service \
  --cluster property-management-cluster \
  --service property-management-service \
  --task-definition property-management-task:PREVIOUS_REVISION
```
