#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          GitHub Repository Setup                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "📋 Before running this script:"
echo "   1. Create a new repository on GitHub: https://github.com/new"
echo "   2. DO NOT initialize with README, .gitignore, or license"
echo "   3. Copy the repository URL"
echo ""

read -p "Have you created the GitHub repository? (y/n): " CREATED
if [ "$CREATED" != "y" ]; then
    echo ""
    echo "Please create the repository first, then run this script again."
    echo "Visit: https://github.com/new"
    exit 0
fi

echo ""
read -p "Enter your GitHub repository URL: " REPO_URL

if [ -z "$REPO_URL" ]; then
    echo "❌ Repository URL cannot be empty"
    exit 1
fi

echo ""
echo "🔗 Adding GitHub remote..."

# Remove existing origin if it exists (except gitsafe-backup)
if git remote | grep -q "^origin$"; then
    echo "Removing existing origin remote..."
    git remote remove origin
fi

# Add the new remote
git remote add origin "$REPO_URL"

echo "✅ Remote added successfully"
echo ""

# Show remotes
echo "📍 Current remotes:"
git remote -v
echo ""

# Check if there are any uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes. Committing them now..."
    git add .
    git commit -m "Final changes before initial push"
fi

echo "🚀 Pushing to GitHub..."
echo ""

# Try to push
if git push -u origin main; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          ✅ SUCCESS! Code pushed to GitHub                     ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📋 Next Steps:"
    echo ""
    echo "1. Set up GitHub Secrets (REQUIRED for deployment):"
    echo "   Go to: $REPO_URL/settings/secrets/actions"
    echo ""
    echo "   Add these three secrets:"
    echo "   • AWS_ACCESS_KEY_ID"
    echo "   • AWS_SECRET_ACCESS_KEY"
    echo "   • EB_S3_BUCKET = property-management-deployments-1772952264"
    echo ""
    echo "2. Wait for AWS resources to be ready:"
    echo "   Run: ./scripts/check-deployment-status.sh"
    echo ""
    echo "3. Configure environment variables (after AWS is ready):"
    echo "   See AWS_DEPLOYMENT_INFO.md for commands"
    echo ""
    echo "4. Trigger deployment:"
    echo "   git commit --allow-empty -m 'Deploy to AWS'"
    echo "   git push origin main"
    echo ""
    echo "📚 Documentation:"
    echo "   • GITHUB_SETUP.md - Detailed GitHub setup"
    echo "   • AWS_DEPLOYMENT_INFO.md - AWS configuration"
    echo "   • QUICKSTART.md - Complete deployment guide"
    echo ""
else
    echo ""
    echo "❌ Push failed. Common issues:"
    echo ""
    echo "1. Authentication Error:"
    echo "   • Use a Personal Access Token instead of password"
    echo "   • Create one at: https://github.com/settings/tokens"
    echo "   • Or set up SSH keys"
    echo ""
    echo "2. Permission Denied:"
    echo "   • Make sure you have write access to the repository"
    echo "   • Verify the repository URL is correct"
    echo ""
    echo "See GITHUB_SETUP.md for detailed troubleshooting"
    exit 1
fi
