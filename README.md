# SquaresHQ

A web app to manage sports "squares" pools for your friend group. Track picks, payments, and winners automatically.

## Quick Start

### 1. Set up the database

Create a PostgreSQL database:
```bash
createdb squareshq
```

Run migrations:
```bash
cd backend
cp ../.env.example .env
# Edit .env with your database URL
npm install
npm run migrate
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

Backend runs at http://localhost:3000

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173

## Features

- Create pools for NFL, NBA, NHL, MLB, NCAAF, NCAAB, Soccer, or custom events
- 10x10 grid with automatic digit randomization
- Track player payments
- Auto-calculate winners based on scores
- Mobile-friendly UI

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL

## Free Hosting Options

- **Database:** Supabase or Neon (free tier)
- **Backend:** Railway or Render (free tier)
- **Frontend:** Vercel or Netlify (free)
