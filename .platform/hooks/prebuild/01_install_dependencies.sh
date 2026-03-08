#!/bin/bash
set -e

echo "Installing production dependencies..."
cd /var/app/staging
npm ci --omit=dev
