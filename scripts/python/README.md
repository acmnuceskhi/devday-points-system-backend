# Python Admin Bootstrap Script

This folder contains a Python helper to create or update a backend admin account.

## Script

- `create_admin_account.py`

## What it does

- Creates or updates a `User` row as `STAFF`
- Creates or updates matching `StaffProfile` row (`id` == `User.id`)
- Sets `isApproved=true` and staff role (default `SUPERADMIN`)
- Hashes password using project `bcryptjs` through Node

## Requirements

Install one PostgreSQL driver for Python:

```bash
pip install psycopg[binary]
# or
pip install psycopg2-binary
```

## Usage

From backend root:

```bash
python scripts/python/create_admin_account.py \
  --email admin@example.com \
  --full-name "Admin User" \
  --nu-id NU-0001
```

Optional flags:

- `--staff-role SUPERADMIN|ADMIN|MODERATOR` (default: `SUPERADMIN`)
- `--database-url <postgres-url>` (otherwise uses `DATABASE_URL` from `.env`)
- `--password <plain-text-password>` (if omitted, script prompts securely)

## Notes

- If the email already belongs to a non-`STAFF` user, the script aborts.
- If the NU ID belongs to another staff profile, the script aborts.
