#!/bin/bash
set -e

echo "🚀 AWS Deployment Setup Script"
echo "================================"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first:"
    echo "   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI configured"
echo ""

# Get configuration from user
read -p "Enter AWS Region (default: us-east-1): " AWS_REGION
AWS_REGION=${AWS_REGION:-us-east-1}

read -p "Enter Application Name (default: property-management-app): " APP_NAME
APP_NAME=${APP_NAME:-property-management-app}

read -p "Enter Environment Name (default: production): " ENV_NAME
ENV_NAME=${ENV_NAME:-production}

echo ""
echo "📋 Configuration:"
echo "   Region: $AWS_REGION"
echo "   App Name: $APP_NAME"
echo "   Environment: $ENV_NAME"
echo ""

read -p "Choose deployment method (1=Elastic Beanstalk, 2=ECS): " DEPLOY_METHOD

if [ "$DEPLOY_METHOD" = "1" ]; then
    echo ""
    echo "🔧 Setting up Elastic Beanstalk..."
    
    # Create application
    echo "Creating EB application..."
    aws elasticbeanstalk create-application \
        --application-name "$APP_NAME" \
        --description "Property Management Application" \
        --region "$AWS_REGION" || echo "Application may already exist"
    
    # Create S3 bucket for deployments
    BUCKET_NAME="${APP_NAME}-deployments-$(date +%s)"
    echo "Creating S3 bucket: $BUCKET_NAME"
    aws s3 mb "s3://$BUCKET_NAME" --region "$AWS_REGION"
    
    echo ""
    echo "✅ Elastic Beanstalk setup complete!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Create RDS database (see DEPLOYMENT.md)"
    echo "2. Add GitHub secrets:"
    echo "   - AWS_ACCESS_KEY_ID"
    echo "   - AWS_SECRET_ACCESS_KEY"
    echo "   - EB_S3_BUCKET=$BUCKET_NAME"
    echo "3. Update .github/workflows/deploy.yml with:"
    echo "   - AWS_REGION: $AWS_REGION"
    echo "   - EB_APPLICATION_NAME: $APP_NAME"
    echo "4. Push to main branch to deploy"
    
elif [ "$DEPLOY_METHOD" = "2" ]; then
    echo ""
    echo "🔧 Setting up ECS..."
    
    # Create ECR repository
    echo "Creating ECR repository..."
    aws ecr create-repository \
        --repository-name "$APP_NAME" \
        --region "$AWS_REGION" || echo "Repository may already exist"
    
    # Create ECS cluster
    echo "Creating ECS cluster..."
    aws ecs create-cluster \
        --cluster-name "${APP_NAME}-cluster" \
        --region "$AWS_REGION" || echo "Cluster may already exist"
    
    # Get ECR URI
    ECR_URI=$(aws ecr describe-repositories \
        --repository-names "$APP_NAME" \
        --region "$AWS_REGION" \
        --query 'repositories[0].repositoryUri' \
        --output text)
    
    echo ""
    echo "✅ ECS setup complete!"
    echo ""
    echo "📝 Next steps:"
    echo "1. Set up infrastructure with Terraform:"
    echo "   cd infrastructure/terraform"
    echo "   terraform init"
    echo "   terraform apply"
    echo "2. Create task definition (see DEPLOYMENT.md)"
    echo "3. Add GitHub secrets:"
    echo "   - AWS_ACCESS_KEY_ID"
    echo "   - AWS_SECRET_ACCESS_KEY"
    echo "4. Update .github/workflows/deploy-ecs.yml with:"
    echo "   - AWS_REGION: $AWS_REGION"
    echo "   - ECR_REPOSITORY: $APP_NAME"
    echo "5. ECR Repository URI: $ECR_URI"
    echo "6. Push to main branch to deploy"
else
    echo "❌ Invalid option"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
