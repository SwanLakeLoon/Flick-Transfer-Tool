#!/usr/bin/env python3
"""
PocketBase Schema Setup Script for Flick File Transfer Tool

Initializes the 'drops', 'videos', and 'users' collections
with appropriate fields, indexes, and API rules.

Usage:
    POCKETBASE_URL=http://127.0.0.1:8090 \
    PB_ADMIN_EMAIL=admin@local.dev \
    PB_ADMIN_PASS=admin123456 \
    uv run scripts/setup-schema.py
"""
# /// script
# requires-python = ">=3.11"
# dependencies = ["httpx"]
# ///

import os
import sys
import httpx

PB_URL  = os.environ.get("POCKETBASE_URL", "http://127.0.0.1:8090")
ADMIN_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASS  = os.environ.get("PB_ADMIN_PASS",  "admin123456")


def api(client: httpx.Client, path: str, method: str = "GET", json_data=None, token: str | None = None):
    headers = {"Authorization": token} if token else {}
    resp = client.request(method, f"{PB_URL}{path}", json=json_data, headers=headers)
    try:
        data = resp.json()
    except Exception:
        data = resp.text
    if not resp.is_success:
        print(f"❌ {method} {path} → {resp.status_code}: {data}", file=sys.stderr)
        raise RuntimeError(f"API error: {resp.status_code}")
    return data


def make_collection(client, token, names_list, name, payload):
    if name in names_list:
        print(f"⏭️  {name} already exists")
    else:
        print(f"📦 Creating {name}...")
        api(client, "/api/collections", "POST", payload, token=token)
        print(f"✅ {name} created")


def update_collection(client, token, col_id, payload):
    api(client, f"/api/collections/{col_id}", "PATCH", payload, token=token)


def main():
    print(f"\n🔌 Connecting to PocketBase at {PB_URL}...\n")

    with httpx.Client(timeout=30) as c:
        auth = api(c, "/api/collections/_superusers/auth-with-password", "POST", {
            "identity": ADMIN_EMAIL, "password": ADMIN_PASS,
        })
        token = auth["token"]
        print("✅ Authenticated as superuser\n")

        existing = api(c, "/api/collections?perPage=200", "GET", token=token)
        items = existing if isinstance(existing, list) else existing.get("items", [])
        names = [col["name"] for col in items]

        # ── 1. Users ───────────────────────────────────────────────────────
        users_col = next((col for col in items if col["name"] == "users"), None)
        if users_col:
            fields = users_col.get("fields", users_col.get("schema", []))
            role_field = next((f for f in fields if f["name"] == "role"), None)
            needed = {"admin", "approver"}
            if role_field:
                if needed.issubset(set(role_field.get("values", []))):
                    print("⏭️  users.role has required values")
                else:
                    role_field["values"] = sorted(needed)
                    update_collection(c, token, users_col["id"], {"fields": fields})
                    print("✅ users.role updated")
            else:
                fields.append({"name": "role", "type": "select", "values": sorted(needed), "maxSelect": 1})
                update_collection(c, token, users_col["id"], {"fields": fields})
                print("✅ users.role added")

        # ── 2. Drops ──────────────────────────────────────────────────────
        make_collection(c, token, names, "drops", {
            "id": "pbc_drops000001",
            "name": "drops",
            "type": "base",
            "indexes": [
                "CREATE UNIQUE INDEX idx_drops_token ON drops (token)"
            ],
            "fields": [
                {"name": "token",       "type": "text", "required": True, "max": 128, "presentable": True},
                {"name": "status",      "type": "select", "required": True,
                 "values": ["awaiting_uploads", "submitted", "processing", "completed"], "maxSelect": 1},
                {"name": "result_key",  "type": "text"},
                {"name": "video_count", "type": "number"},
                {"name": "expires_at",  "type": "date"},
                {"name": "created",     "type": "autodate", "onCreate": True, "onUpdate": False},
                {"name": "updated",     "type": "autodate", "onCreate": True, "onUpdate": True},
            ],
        })

        # ── 3. Videos ─────────────────────────────────────────────────────
        make_collection(c, token, names, "videos", {
            "id": "pbc_videos00001",
            "name": "videos",
            "type": "base",
            "indexes": [
                "CREATE INDEX idx_videos_drop ON videos (drop)"
            ],
            "fields": [
                {"name": "drop",          "type": "relation", "required": True,
                 "collectionId": "pbc_drops000001", "maxSelect": 1, "cascadeDelete": True},
                {"name": "s3_key",        "type": "text", "required": True},
                {"name": "original_name", "type": "text", "required": True},
                {"name": "size_bytes",    "type": "number"},
                {"name": "content_type",  "type": "text"},
                {"name": "uploaded_at",   "type": "date"},
                {"name": "created",       "type": "autodate", "onCreate": True, "onUpdate": False},
                {"name": "updated",       "type": "autodate", "onCreate": True, "onUpdate": True},
            ],
        })

        # ── Apply API Rules ──────────────────────────────────────────────
        print("\n🔧 Applying API access rules...")

        # Refresh snapshot
        cols = api(c, "/api/collections?perPage=200", "GET", token=token)
        items = cols if isinstance(cols, list) else cols.get("items", [])

        def safe_patch(col_name, rule_payload):
            col_obj = next((f for f in items if f["name"] == col_name), None)
            if col_obj:
                api(c, f"/api/collections/{col_obj['id']}", "PATCH", rule_payload, token=token)
                print(f"  ✅ {col_name} rules updated")

        # Drops:
        #   Create = anyone (anonymous drop creation)
        #   List/View = admin OR matched by query token
        #   Update/Delete = admin only
        safe_patch("drops", {
            "createRule": "",  # open
            "listRule":   '@request.auth.role ?= "admin" || token = @request.query.qtoken',
            "viewRule":   '@request.auth.role ?= "admin" || token = @request.query.qtoken',
            "updateRule": '@request.auth.role ?= "admin"',
            "deleteRule": '@request.auth.role ?= "admin"',
        })

        # Videos:
        #   Create = anyone (sidecar validates before presigning)
        #   List/View = admin OR matched by drop token query param
        #   Update/Delete = admin only
        safe_patch("videos", {
            "createRule": "",  # open
            "listRule":   '@request.auth.role ?= "admin" || drop.token = @request.query.qtoken',
            "viewRule":   '@request.auth.role ?= "admin" || drop.token = @request.query.qtoken',
            "updateRule": '@request.auth.role ?= "admin"',
            "deleteRule": '@request.auth.role ?= "admin"',
        })

        # Users: self + admin
        if users_col:
            user_rule = 'id = @request.auth.id || @request.auth.role ?= "admin"'
            opts = users_col.get("options", {})
            opts["manageRule"] = '@request.auth.role ?= "admin"'
            safe_patch("users", {
                "listRule": user_rule, "viewRule": user_rule,
                "updateRule": user_rule, "deleteRule": user_rule,
                "options": opts,
            })

        print("\n🎉 Flick schema setup complete!")


if __name__ == "__main__":
    main()
