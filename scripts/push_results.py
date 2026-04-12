#!/usr/bin/env python3
"""
Push processed results.csv back to a Flick drop and mark it as completed.

Usage:
    python scripts/push_results.py <drop_token> <path_to_results.csv>

Requires the same environment variables as pull_drop.py.
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx", "boto3"]
# ///

import os
import sys
import hashlib
import httpx
import boto3

PB_URL      = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASS  = os.environ.get("PB_ADMIN_PASS",  "admin123456")

S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "https://fsn1.your-objectstorage.com")
S3_KEY      = os.environ.get("S3_ACCESS_KEY", "")
S3_SECRET   = os.environ.get("S3_SECRET_KEY", "")
S3_BUCKET   = os.environ.get("S3_BUCKET", "flick-inbox")


def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/push_results.py <drop_token> <path_to_results.csv>")
        sys.exit(1)

    drop_token = sys.argv[1]
    csv_path = os.path.abspath(sys.argv[2])

    if not os.path.exists(csv_path):
        print(f"❌ File not found: {csv_path}")
        sys.exit(1)

    print(f"⚡ Push results → {os.path.basename(csv_path)}")

    with httpx.Client(timeout=30) as c:
        # Authenticate
        auth = c.post(f"{PB_URL}/api/collections/_superusers/auth-with-password", json={
            "identity": ADMIN_EMAIL, "password": ADMIN_PASS,
        }).json()
        token = auth["token"]
        headers = {"Authorization": token}

        # Find the drop
        drops = c.get(f'{PB_URL}/api/collections/drops/records?filter=(token="{drop_token}")&perPage=1',
                       headers=headers).json()
        if not drops.get("items"):
            print("❌ Drop not found.")
            sys.exit(1)

        drop = drops["items"][0]
        drop_id = drop["id"]
        print(f"  Drop ID: {drop_id} | Status: {drop['status']}")

        # Upload CSV to S3
        token_hash = hashlib.sha256(drop_token.encode()).hexdigest()[:16]
        s3_key = f"results/{token_hash}/results.csv"

        s3 = boto3.client(
            's3',
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_KEY,
            aws_secret_access_key=S3_SECRET,
        )

        file_size = os.path.getsize(csv_path)
        print(f"  📤 Uploading results.csv ({file_size / 1024:.1f} KB) to s3://{S3_BUCKET}/{s3_key}...")
        s3.upload_file(csv_path, S3_BUCKET, s3_key, ExtraArgs={"ContentType": "text/csv"})
        print(f"  ✅ Uploaded")

        # Update drop: set result_key and status
        c.patch(f"{PB_URL}/api/collections/drops/records/{drop_id}",
                json={"result_key": s3_key, "status": "completed"}, headers=headers)
        print(f"  📦 Drop status → completed")

    print(f"\n🎉 Done! The uploader can now download their CSV at /drop/{drop_token}")


if __name__ == "__main__":
    main()
