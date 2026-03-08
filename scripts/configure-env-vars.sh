#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          Configure Environment Variables                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if environment is ready
STATUS=$(aws elasticbeanstalk describe-environments \
  --application-name property-management-app \
  --environment-names property-management-env \
  --region us-east-1 \
  --query 'Environments[0].Status' \
  --output text)

if [ "$STATUS" != "Ready" ]; then
    echo "⚠️  Environment is not ready yet (Status: $STATUS)"
    echo "   Please wait for the environment to be ready, then run this script again."
    echo ""
    echo "   Check status with: ./scripts/check-deployment-status.sh"
    exit 1
fi

echo "✅ Environment is ready!"
echo ""

# Get database endpoint
DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

echo "📊 Database endpoint: $DB_ENDPOINT"
echo ""

# Generate session secret
SESSION_SECRET=$(openssl rand -base64 32)
echo "🔐 Generated session secret"
echo ""

# Update environment variables
echo "🔧 Updating environment variables..."
aws elasticbeanstalk update-environment \
  --application-name property-management-app \
  --environment-name property-management-env \
  --region us-east-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value="postgresql://dbadmin:(65H\$2v:5T#88=tMQK%Vzycn@$DB_ENDPOINT:5432/propertymanagement" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SESSION_SECRET,Value="$SESSION_SECRET" \
  --query 'EnvironmentName' \
  --output text

echo ""
echo "✅ Environment variables configured successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Wait for environment to update (2-3 minutes)"
echo "2. Deploy your application: git push origin main"
echo "3. Initialize database: See AWS_DEPLOYMENT_INFO.md"
echo ""
