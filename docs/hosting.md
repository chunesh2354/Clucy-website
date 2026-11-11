# Hosting on AWS

The site is static. It is served from a **private S3 bucket** through **CloudFront** with an HTTPS certificate from **ACM**, at `clucy.csdv.in`. DNS stays where the domain is managed (GoDaddy).

```
visitor ── https://clucy.csdv.in ──> CloudFront (cache, HTTPS, security headers)
                                        └── origin access control ──> S3 bucket (private, no public access)
```

## Deploy

```bash
AWS_PROFILE=csdv ./scripts/deploy-aws.sh
```

The script builds the site, creates the bucket, origin access control and distribution if they are missing, uploads `dist/`, and refreshes the CDN. Run it again after every change. Hashed files under `assets/` are cached for a year; `index.html` is always revalidated, so a new deploy shows up at once.

## One-time setup

1. **Certificate.** Request a public certificate for `clucy.csdv.in` in ACM, region **us-east-1**, with DNS validation (already requested).
2. **Validation record.** In GoDaddy, DNS for `csdv.in`, add the CNAME that ACM shows for the certificate. GoDaddy's *Name* field takes only the part before `.csdv.in`. ACM issues the certificate a few minutes after the record is live.
3. **Deploy** with the script above. Once the certificate is issued, the script attaches `clucy.csdv.in` to the distribution.
4. **Site record.** In GoDaddy, add a CNAME: name `clucy`, value the distribution's `…cloudfront.net` address (the script prints it).

## Permissions the deploying user needs

S3 on the site bucket (`CreateBucket`, `PutPublicAccessBlock`, `PutBucketTagging`, `PutBucketPolicy`, `ListBucket`, `PutObject`, `DeleteObject`, `GetObject`), CloudFront (`CreateOriginAccessControl`, `ListOriginAccessControls`, `CreateDistribution`, `UpdateDistribution`, `GetDistribution`, `GetDistributionConfig`, `ListDistributions`, `CreateInvalidation`), and ACM `ListCertificates` in us-east-1. Neither an organisation policy (SCP) nor the user's own IAM policy may deny them.

## Cost

At landing-page traffic this sits almost entirely inside the AWS free tier (CloudFront includes 1 TB of transfer a month); expect cents a month for S3 storage and requests.
