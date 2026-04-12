#!/usr/bin/env python3
"""
Pull all videos from a Flick drop to a local directory.

Usage:
    python scripts/pull_drop.py <drop_token> <output_dir>

Requires environment variables:
    POCKETBASE_URL   (default: http://127.0.0.1:8090)
    PB_ADMIN_EMAIL
    PB_ADMIN_PASS
    S3_ENDPOINT      (e.g., https://fsn1.your-objectstorage.com)
    S3_ACCESS_KEY
    S3_SECRET_KEY
    S3_BUCKET        (default: flick-inbox)
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx", "boto3"]
# ///

import os
import sys
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
        print("Usage: python scripts/pull_drop.py <drop_token> <output_dir>")
        sys.exit(1)

    drop_token = sys.argv[1]
    output_dir = os.path.abspath(sys.argv[2])
    os.makedirs(output_dir, exist_ok=True)

    print(f"⚡ Pull drop → {output_dir}")

    with httpx.Client(timeout=30) as c:
        # Authenticate as admin
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
        print(f"  Drop ID: {drop_id} | Status: {drop['status']} | Videos: {drop.get('video_count', '?')}")

        # Fetch video records
        videos = c.get(f'{PB_URL}/api/collections/videos/records?filter=(drop="{drop_id}")&perPage=200',
                        headers=headers).json()
        video_list = videos.get("items", [])

        if not video_list:
            print("  No videos to download.")
            return

        # Download from S3
        s3 = boto3.client(
            's3',
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_KEY,
            aws_secret_access_key=S3_SECRET,
        )

        for i, v in enumerate(video_list, 1):
            s3_key = v["s3_key"]
            filename = v["original_name"]
            out_path = os.path.join(output_dir, filename)

            # Skip if already downloaded
            if os.path.exists(out_path) and os.path.getsize(out_path) == v.get("size_bytes", -1):
                print(f"  [{i}/{len(video_list)}] ⏭️  {filename} (already exists)")
                continue

            print(f"  [{i}/{len(video_list)}] ⬇  {filename} ({v.get('size_bytes', 0) / 1_048_576:.1f} MB)...")
            s3.download_file(S3_BUCKET, s3_key, out_path)
            print(f"    ✅ Downloaded")

        # Update status to processing
        if drop["status"] == "submitted":
            c.patch(f"{PB_URL}/api/collections/drops/records/{drop_id}",
                    json={"status": "processing"}, headers=headers)
            print(f"\n  📦 Drop status → processing")

    print(f"\n🎉 Done! {len(video_list)} video(s) downloaded to {output_dir}")


if __name__ == "__main__":
    main()
