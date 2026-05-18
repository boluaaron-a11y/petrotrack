# PetroTrak Web

Next.js + Tailwind frontend for attendant shift data entry, with Xano-ready backend routes.

## What is included

- Mobile-first one-column attendant entry page in `app/page.tsx`
- Dynamic calculations for:
	- Quantity sold
	- Expected income
	- Cash total
	- Total received (cash + POS + transfer)
	- Total outstanding (credit sales)
- Dynamic `+ Add New Credit Sale` and `+ Add Expense / Other`
- API routes:
	- `GET /api/bootstrap` (loads attendant user)
	- `POST /api/shift-entries` (saves shift entry)
- Sample user generator fallback when Xano is not configured

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Xano setup

1. Copy `.env.example` to `.env.local`.
2. Fill the values:
	 - `XANO_BASE_URL`
	 - `XANO_API_KEY` (optional)
	 - `XANO_USER_ENDPOINT`
	 - `XANO_SHIFT_ENTRIES_ENDPOINT` (defaults to `/shift_entries`)

When `XANO_BASE_URL` is set, submitted shift entries are posted to Xano. Without it, the app uses local sample storage for development.

If these are missing, the app automatically uses sample mode.

## Main files

- `app/page.tsx` - attendant UI and calculations
- `app/api/bootstrap/route.ts` - attendant bootstrap endpoint
- `app/api/shift-entries/route.ts` - shift entry save endpoint
- `lib/calculations.ts` - formula helpers
- `lib/types.ts` - shared types
- `lib/xano.ts` - Xano request utility
