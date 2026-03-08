#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          AWS Deployment Status Check                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check Elastic Beanstalk
echo "📦 Elastic Beanstalk Environment:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws elasticbeanstalk describe-environments \
  --application-name property-management-app \
  --environment-names property-management-env \
  --region us-east-1 \
  --query 'Environments[0].[Status,Health,CNAME]' \
  --output table 2>/dev/null || echo "❌ Not found or error"

echo ""

# Check RDS
echo "🗄️  RDS Database:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].[DBInstanceStatus,Endpoint.Address]' \
  --output table 2>/dev/null || echo "❌ Not found or error"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if both are ready
EB_STATUS=$(aws elasticbeanstalk describe-environments \
  --application-name property-management-app \
  --environment-names property-management-env \
  --region us-east-1 \
  --query 'Environments[0].Status' \
  --output text 2>/dev/null)

RDS_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].DBInstanceStatus' \
  --output text 2>/dev/null)

if [ "$EB_STATUS" = "Ready" ] && [ "$RDS_STATUS" = "available" ]; then
    echo "✅ Both resources are READY!"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Get database endpoint and configure environment variables"
    echo "2. Set up GitHub secrets"
    echo "3. Push to GitHub to deploy"
    echo ""
    echo "See AWS_DEPLOYMENT_INFO.md for detailed instructions."
elif [ "$EB_STATUS" = "Launching" ] || [ "$RDS_STATUS" = "creating" ]; then
    echo "⏳ Resources are still being created..."
    echo "   This typically takes 10-15 minutes."
    echo ""
    echo "   Run this script again in a few minutes to check status."
else
    echo "⚠️  Status: EB=$EB_STATUS, RDS=$RDS_STATUS"
    echo ""
    echo "   Check AWS Console for more details or run:"
    echo "   aws elasticbeanstalk describe-events --environment-name property-management-env --region us-east-1"
fi

echo ""
