# GitHub Repository Setup Guide

Follow these steps to create your GitHub repository and push your code.

## Step 1: Create a New Repository on GitHub

1. Go to https://github.com/new
2. Fill in the repository details:
   - **Repository name**: `property-management-app` (or your preferred name)
   - **Description**: Property Management Application with Email Integration
   - **Visibility**: Choose Private or Public
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
3. Click "Create repository"

## Step 2: Copy Your Repository URL

After creating the repository, GitHub will show you a page with setup instructions.

Copy the repository URL. It will look like:
- HTTPS: `https://github.com/YOUR-USERNAME/property-management-app.git`
- SSH: `git@github.com:YOUR-USERNAME/property-management-app.git`

## Step 3: Add Remote and Push

Run these commands in your terminal (replace with your actual repo URL):

```bash
# Add GitHub as remote origin
git remote add origin https://github.com/YOUR-USERNAME/property-management-app.git

# Verify the remote was added
git remote -v

# Push your code to GitHub
git push -u origin main
```

If you get an authentication error, you may need to:
- Use a Personal Access Token instead of password
- Or set up SSH keys

### Using Personal Access Token (Recommended)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name like "Property Management Deploy"
4. Select scopes: `repo` (full control of private repositories)
5. Click "Generate token"
6. Copy the token (you won't see it again!)
7. When pushing, use the token as your password

### Using SSH (Alternative)

If you prefer SSH:
```bash
# Generate SSH key if you don't have one
ssh-keygen -t ed25519 -C "your_email@example.com"

# Copy the public key
cat ~/.ssh/id_ed25519.pub

# Add it to GitHub: Settings → SSH and GPG keys → New SSH key
```

Then use the SSH URL:
```bash
git remote add origin git@github.com:YOUR-USERNAME/property-management-app.git
git push -u origin main
```

## Step 4: Set Up GitHub Secrets

After pushing, set up the secrets for CI/CD:

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these three secrets:

### Secret 1: AWS_ACCESS_KEY_ID
- Name: `AWS_ACCESS_KEY_ID`
- Value: Your AWS access key ID
- Click "Add secret"

To get your AWS credentials:
```bash
# View your AWS credentials
cat ~/.aws/credentials
```

Or create new ones:
1. Go to AWS Console → IAM → Users
2. Click on your user
3. Go to "Security credentials" tab
4. Click "Create access key"
5. Choose "Command Line Interface (CLI)"
6. Copy the Access Key ID and Secret Access Key

### Secret 2: AWS_SECRET_ACCESS_KEY
- Name: `AWS_SECRET_ACCESS_KEY`
- Value: Your AWS secret access key
- Click "Add secret"

### Secret 3: EB_S3_BUCKET
- Name: `EB_S3_BUCKET`
- Value: `property-management-deployments-1772952264`
- Click "Add secret"

## Step 5: Verify Setup

After adding secrets, verify everything is set up:

1. Go to your repository → **Actions** tab
2. You should see the workflow files listed
3. The workflow won't run yet because we need to configure environment variables first

## Step 6: Configure Environment Variables in AWS

Wait for your AWS resources to be ready (check with `./scripts/check-deployment-status.sh`), then run:

```bash
# Get the database endpoint
DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier property-management-db \
  --region us-east-1 \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Generate a session secret
SESSION_SECRET=$(openssl rand -base64 32)

# Update Elastic Beanstalk environment variables
aws elasticbeanstalk update-environment \
  --application-name property-management-app \
  --environment-name property-management-env \
  --region us-east-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DATABASE_URL,Value="postgresql://dbadmin:(65H\$2v:5T#88=tMQK%Vzycn@$DB_ENDPOINT:5432/propertymanagement" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=SESSION_SECRET,Value="$SESSION_SECRET"
```

## Step 7: Deploy!

Once environment variables are configured, trigger a deployment:

```bash
# Make a small change to trigger deployment
git commit --allow-empty -m "Trigger initial deployment"
git push origin main
```

Watch the deployment:
1. Go to GitHub → Your repository → **Actions** tab
2. Click on the running workflow
3. Monitor the deployment progress

## Troubleshooting

### Authentication Failed
- Make sure you're using a Personal Access Token, not your password
- Or set up SSH keys

### Permission Denied
- Check that your AWS credentials have the necessary permissions
- Verify the secrets are added correctly in GitHub

### Workflow Doesn't Run
- Make sure you pushed to the `main` branch
- Check that the workflow file is in `.github/workflows/deploy.yml`
- Verify GitHub Actions is enabled in your repository settings

## Next Steps After Successful Push

1. ✅ Code is on GitHub
2. ✅ Secrets are configured
3. ⏳ Wait for AWS resources to be ready
4. ⏳ Configure environment variables
5. ⏳ Push to trigger deployment
6. ⏳ Run database migrations
7. ✅ Application is live!

---

**Need Help?**
- Check AWS_DEPLOYMENT_INFO.md for AWS-specific details
- Check DEPLOYMENT.md for comprehensive deployment guide
- Check QUICKSTART.md for step-by-step walkthrough
