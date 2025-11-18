# Creating a Default Admin Account

This project includes a one-off script to create a default administrator user.
We intentionally avoid creating admin accounts automatically at server startup; use the script below instead.

## Script
`src/utils/createAdmin.ts` — connects to MongoDB and creates an admin user if none exists.

## Environment variables
You can configure the admin account using environment variables. If omitted, the script uses safe defaults.

- `DEFAULT_ADMIN_USERNAME` — default: `admin`
- `DEFAULT_ADMIN_PASSWORD` — default: `Admin123@parian`
- `DEFAULT_ADMIN_EMAIL` — default: `admin@localhost.local`
- `DEFAULT_ADMIN_BARANGAY_ID` — default: `0000`
- `MONGODB_URI` — MongoDB connection string (if not set, defaults to `mongodb://localhost:27017/alphaversion`)

## How to run (local)
Open PowerShell in the `server` directory and run:

```powershell
cd C:\Users\Lawrence\Desktop\Alphaversion\server
npx ts-node src/utils/createAdmin.ts
```

To pass a custom password or username via environment variables:

```powershell
$env:DEFAULT_ADMIN_USERNAME='admin'
$env:DEFAULT_ADMIN_PASSWORD='Admin123@parian'
$env:MONGODB_URI='mongodb://localhost:27017/alphaversion'
npx ts-node src/utils/createAdmin.ts
```

## How to run (production / Render)
Set the same environment variables in your hosting provider's secret manager (e.g., Render secrets). Then use the provider's console to run the script once (or run during deployment via a one-off job). Example Render one-off command:

```
# render CLI or dashboard: run `node dist/src/utils/createAdmin.js` after building
```

## Security recommendations
- Immediately change the default password after first login.
- Prefer generating a strong random password and storing it in your platform's secrets.
- After the admin account is created, delete or rotate the password in any plaintext environments.
- Do not enable any automatic admin-creation on server startup in production.

## Verification
After running the script, check the `users` collection in MongoDB for a user with `role: 'admin'`.

```powershell
# Example using mongo shell
mongo mongodb://localhost:27017/alphaversion --eval "db.users.find({role:'admin'}).pretty()"
```

If you want, I can add a small `npm` script or a PM2 one-off task to run this script in your deployment flow.