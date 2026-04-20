#!/usr/bin/env python3
"""
Create or update a STAFF admin account for devday-points-system-backend.

Usage examples:
  python scripts/python/create_admin_account.py \
    --email admin@example.com \
    --full-name "Admin User" \
    --nu-id NU-0001

  python scripts/python/create_admin_account.py \
    --email admin@example.com \
    --full-name "Admin User" \
    --nu-id NU-0001 \
    --staff-role SUPERADMIN \
    --database-url "postgresql://..."

Notes:
- Reads DATABASE_URL from .env by default (or --database-url if provided).
- Hashes password using Node's bcryptjs from this backend project.
- Creates/updates both "User" and "StaffProfile" rows in one transaction.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import pathlib
import subprocess
import sys
import uuid
from dataclasses import dataclass


ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
ENV_FILE = ROOT_DIR / ".env"


def load_dotenv_file(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if value.startswith('"') and value.endswith('"') and len(value) >= 2:
            value = value[1:-1]
        elif value.startswith("'") and value.endswith("'") and len(value) >= 2:
            value = value[1:-1]

        values[key] = value

    return values


@dataclass
class DbAdapter:
    kind: str
    conn: object

    def cursor(self):
        if self.kind == "psycopg3":
            return self.conn.cursor()
        return self.conn.cursor()

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()


def open_db_connection(database_url: str) -> DbAdapter:
    try:
        import psycopg

        conn = psycopg.connect(database_url)
        return DbAdapter(kind="psycopg3", conn=conn)
    except ModuleNotFoundError:
        pass

    try:
        import psycopg2

        conn = psycopg2.connect(database_url)
        return DbAdapter(kind="psycopg2", conn=conn)
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Neither psycopg (v3) nor psycopg2 is installed. Install one with:\n"
            "  pip install psycopg[binary]\n"
            "or\n"
            "  pip install psycopg2-binary"
        ) from exc


def hash_password_with_node(password: str) -> str:
    node_script = (
        "const bcrypt = require('bcryptjs');"
        "const input = process.argv[1] || '';"
        "const out = bcrypt.hashSync(input, 12);"
        "process.stdout.write(JSON.stringify({ hash: out }));"
    )

    result = subprocess.run(
        ["node", "-e", node_script, password],
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "Failed to hash password using Node/bcryptjs. "
            f"stderr: {result.stderr.strip() or 'unknown error'}"
        )

    try:
        payload = json.loads(result.stdout)
        return str(payload["hash"])
    except Exception as exc:
        raise RuntimeError("Unexpected hash output from Node script") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update a STAFF admin account")
    parser.add_argument("--database-url", help="PostgreSQL connection string. Defaults to DATABASE_URL from .env")
    parser.add_argument("--email", required=True, help="Admin email")
    parser.add_argument("--full-name", required=True, help="Staff full name")
    parser.add_argument("--nu-id", required=True, help="Unique NU ID for StaffProfile")
    parser.add_argument(
        "--staff-role",
        default="SUPERADMIN",
        choices=["SUPERADMIN", "ADMIN", "MODERATOR"],
        help="Staff role enum value",
    )
    parser.add_argument("--password", help="Password (omit to be prompted securely)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    env_values = load_dotenv_file(ENV_FILE)
    database_url = args.database_url or os.environ.get("DATABASE_URL") or env_values.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not provided and not found in .env", file=sys.stderr)
        return 1

    email = args.email.strip().lower()
    full_name = args.full_name.strip()
    nu_id = args.nu_id.strip()
    password = args.password

    if not email or not full_name or not nu_id:
        print("ERROR: --email, --full-name, and --nu-id are required", file=sys.stderr)
        return 1

    if not password:
        password = getpass.getpass("Password: ").strip()
    if not password:
        print("ERROR: password cannot be empty", file=sys.stderr)
        return 1

    password_hash = hash_password_with_node(password)

    db = open_db_connection(database_url)

    try:
        with db.cursor() as cur:
            # Prevent NU ID conflicts with a different staff account.
            cur.execute(
                'SELECT id FROM "StaffProfile" WHERE "nuId" = %s LIMIT 1',
                (nu_id,),
            )
            existing_nuid = cur.fetchone()

            cur.execute(
                'SELECT id, type FROM "User" WHERE lower(email) = lower(%s) LIMIT 1',
                (email,),
            )
            user_row = cur.fetchone()

            if user_row:
                user_id = str(user_row[0])
                user_type = str(user_row[1])
                if user_type not in ("STAFF",):
                    raise RuntimeError(
                        f"User with email {email} exists as type {user_type}. "
                        "Refusing to repurpose non-STAFF account automatically."
                    )

                cur.execute(
                    '''
                    UPDATE "User"
                    SET
                        email = %s,
                        password = %s,
                        "isActive" = true,
                        type = %s::"UserType",
                        "updatedAt" = NOW()
                    WHERE id = %s
                    ''',
                    (email, password_hash, "STAFF", user_id),
                )
            else:
                user_id = str(uuid.uuid4())
                cur.execute(
                    '''
                    INSERT INTO "User"
                        (id, email, password, "isActive", type, "createdAt", "updatedAt")
                    VALUES
                        (%s, %s, %s, true, %s::"UserType", NOW(), NOW())
                    ''',
                    (user_id, email, password_hash, "STAFF"),
                )

            if existing_nuid and str(existing_nuid[0]) != user_id:
                raise RuntimeError(
                    f"nuId '{nu_id}' is already used by a different staff profile ({existing_nuid[0]})."
                )

            cur.execute('SELECT id FROM "StaffProfile" WHERE id = %s LIMIT 1', (user_id,))
            staff_row = cur.fetchone()

            if staff_row:
                cur.execute(
                    '''
                    UPDATE "StaffProfile"
                    SET
                        "fullName" = %s,
                        "nuId" = %s,
                        "isApproved" = true,
                        "approvedAt" = COALESCE("approvedAt", NOW()),
                        "staffRole" = %s::"StaffRole",
                        "updatedAt" = NOW()
                    WHERE id = %s
                    ''',
                    (full_name, nu_id, args.staff_role, user_id),
                )
                action = "updated"
            else:
                cur.execute(
                    '''
                    INSERT INTO "StaffProfile"
                        (id, "fullName", "nuId", "isApproved", "approvedAt", "staffRole", "createdAt", "updatedAt")
                    VALUES
                        (%s, %s, %s, true, NOW(), %s::"StaffRole", NOW(), NOW())
                    ''',
                    (user_id, full_name, nu_id, args.staff_role),
                )
                action = "created"

        db.commit()
        print(f"Success: admin account {action} for {email} with role {args.staff_role}")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
