#!/usr/bin/env bash
# Builds the site and publishes it to AWS: a private S3 bucket served through CloudFront over HTTPS.
# Safe to run again: it creates what is missing and updates what exists.
#
#   AWS_PROFILE=csdv ./scripts/deploy-aws.sh
#
# Settings (environment variables, with defaults):
#   SITE_DOMAIN   clucy.csdv.in            the public address
#   SITE_BUCKET   clucy-website-csdv-in    S3 bucket that holds the files (private)
#   SITE_REGION   ap-south-1               bucket region
#   SKIP_BUILD    unset                    set to 1 to upload the existing dist/
#
# The HTTPS certificate for SITE_DOMAIN must be requested in ACM, us-east-1 (CloudFront only reads certificates there).
# Until it is ISSUED, the site is published on its cloudfront.net address only; run the script again once it is.
set -euo pipefail

SITE_DOMAIN="${SITE_DOMAIN:-clucy.csdv.in}"
SITE_BUCKET="${SITE_BUCKET:-clucy-website-csdv-in}"
SITE_REGION="${SITE_REGION:-ap-south-1}"
TAG="clucy-website"
cd "$(dirname "$0")/.."

say() { printf '\n== %s\n' "$*"; }

if [ "${SKIP_BUILD:-}" != "1" ]; then
  say "Building"
  npm run build
fi
[ -f dist/index.html ] || { echo "dist/index.html is missing; build first." >&2; exit 1; }

say "Bucket s3://$SITE_BUCKET ($SITE_REGION)"
if ! aws s3api head-bucket --bucket "$SITE_BUCKET" 2>/dev/null; then
  if [ "$SITE_REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$SITE_BUCKET" --region "$SITE_REGION" --object-ownership BucketOwnerEnforced >/dev/null
  else
    aws s3api create-bucket --bucket "$SITE_BUCKET" --region "$SITE_REGION" \
      --create-bucket-configuration "LocationConstraint=$SITE_REGION" --object-ownership BucketOwnerEnforced >/dev/null
  fi
  echo "created"
fi
aws s3api put-public-access-block --bucket "$SITE_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-tagging --bucket "$SITE_BUCKET" --tagging "TagSet=[{Key=project,Value=$TAG}]"

say "Certificate for $SITE_DOMAIN (us-east-1)"
CERT_ARN=$(aws acm list-certificates --region us-east-1 --certificate-statuses ISSUED \
  --query "CertificateSummaryList[?DomainName=='$SITE_DOMAIN'].CertificateArn | [0]" --output text)
if [ "$CERT_ARN" = "None" ] || [ -z "$CERT_ARN" ]; then
  CERT_ARN=""
  echo "no issued certificate yet: publishing on the cloudfront.net address only"
else
  echo "issued"
fi

say "Origin access control"
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$TAG-oac'].Id | [0]" --output text)
if [ "$OAC_ID" = "None" ] || [ -z "$OAC_ID" ]; then
  OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=$TAG-oac,Description=Clucy website bucket,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query "OriginAccessControl.Id" --output text)
  echo "created $OAC_ID"
fi

say "CloudFront distribution"
DIST_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$TAG'].Id | [0]" --output text)
ORIGIN="$SITE_BUCKET.s3.$SITE_REGION.amazonaws.com"
CACHE_OPTIMIZED="658327ea-f89d-4fab-a63d-7e88639e58f6"     # AWS managed policy: CachingOptimized
SECURITY_HEADERS="67f7725c-6f97-4210-82d7-5512b31e9d03"    # AWS managed policy: SecurityHeadersPolicy

if [ -n "$CERT_ARN" ]; then
  ALIASES="{\"Quantity\":1,\"Items\":[\"$SITE_DOMAIN\"]}"
  VIEWER_CERT="{\"ACMCertificateArn\":\"$CERT_ARN\",\"SSLSupportMethod\":\"sni-only\",\"MinimumProtocolVersion\":\"TLSv1.2_2021\"}"
else
  ALIASES='{"Quantity":0}'
  VIEWER_CERT='{"CloudFrontDefaultCertificate":true}'
fi

dist_config() { # $1 = caller reference
  cat <<JSON
{
  "CallerReference": "$1",
  "Comment": "$TAG",
  "Enabled": true,
  "Aliases": $ALIASES,
  "DefaultRootObject": "index.html",
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "Origins": { "Quantity": 1, "Items": [ {
    "Id": "s3-site", "DomainName": "$ORIGIN", "OriginPath": "",
    "OriginAccessControlId": "$OAC_ID",
    "S3OriginConfig": { "OriginAccessIdentity": "" },
    "CustomHeaders": { "Quantity": 0 }, "ConnectionAttempts": 3, "ConnectionTimeout": 10
  } ] },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-site",
    "ViewerProtocolPolicy": "redirect-to-https",
    "Compress": true,
    "CachePolicyId": "$CACHE_OPTIMIZED",
    "ResponseHeadersPolicyId": "$SECURITY_HEADERS",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } }
  },
  "CustomErrorResponses": { "Quantity": 1, "Items": [
    { "ErrorCode": 403, "ResponsePagePath": "/index.html", "ResponseCode": "200", "ErrorCachingMinTTL": 60 }
  ] },
  "ViewerCertificate": $VIEWER_CERT
}
JSON
}

if [ "$DIST_ID" = "None" ] || [ -z "$DIST_ID" ]; then
  DIST_ID=$(aws cloudfront create-distribution --distribution-config "$(dist_config "$TAG-$(date +%s)")" \
    --query "Distribution.Id" --output text)
  echo "created $DIST_ID (takes a few minutes to reach every edge)"
else
  # keep the original caller reference; refresh aliases and certificate
  CURRENT=$(aws cloudfront get-distribution-config --id "$DIST_ID" --output json)
  ETAG=$(printf '%s' "$CURRENT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).ETag))')
  REF=$(printf '%s' "$CURRENT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).DistributionConfig.CallerReference))')
  aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" --distribution-config "$(dist_config "$REF")" >/dev/null
  echo "updated $DIST_ID"
fi
DIST_ARN=$(aws cloudfront get-distribution --id "$DIST_ID" --query "Distribution.ARN" --output text)
DIST_HOST=$(aws cloudfront get-distribution --id "$DIST_ID" --query "Distribution.DomainName" --output text)

say "Bucket policy: only this distribution may read"
aws s3api put-bucket-policy --bucket "$SITE_BUCKET" --policy "$(cat <<JSON
{ "Version": "2012-10-17", "Statement": [ {
  "Sid": "CloudFrontReadOnly", "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::$SITE_BUCKET/*",
  "Condition": { "StringEquals": { "AWS:SourceArn": "$DIST_ARN" } }
} ] }
JSON
)"

say "Uploading"
# hashed assets never change: cache for a year; the page itself is always revalidated
aws s3 sync dist/assets "s3://$SITE_BUCKET/assets" --delete --cache-control "public,max-age=31536000,immutable"
aws s3 sync dist "s3://$SITE_BUCKET" --delete --exclude "assets/*" --exclude "index.html" --cache-control "public,max-age=3600"
aws s3 cp dist/index.html "s3://$SITE_BUCKET/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8"

say "Refreshing the CDN"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/" "/index.html" --query "Invalidation.Id" --output text

say "Done"
echo "CloudFront address: https://$DIST_HOST"
if [ -n "$CERT_ARN" ]; then
  echo "Site: https://$SITE_DOMAIN  (DNS: CNAME ${SITE_DOMAIN%%.*} -> $DIST_HOST)"
else
  echo "Add the certificate's validation record in DNS, wait for it to be issued, then run this again to attach $SITE_DOMAIN."
fi
