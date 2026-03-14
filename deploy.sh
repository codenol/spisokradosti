#!/usr/bin/env bash
# Deploy to SSH hosting via rsync.
#
# Usage:
#   ./deploy.sh user@example.com:/var/www/wishlist
#
# First deploy:
#   1. Run this script
#   2. Open https://example.com/install.php and fill in DB credentials
#   3. Run: ssh user@example.com "rm /var/www/wishlist/install.php"
#
# Subsequent deploys:
#   Just run this script again — config.php on the server is never touched.

set -euo pipefail

DEST="${1:-}"

if [ -z "$DEST" ]; then
  echo "Usage: $0 user@host:/path/to/webroot"
  exit 1
fi

echo "Deploying to $DEST ..."

rsync -avz --delete \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='config.php' \
  --exclude='deploy.sh' \
  . "$DEST"

echo ""
echo "Done."
echo "First deploy? Run: ssh ${DEST%%:*} \"rm ${DEST#*:}/install.php\""
