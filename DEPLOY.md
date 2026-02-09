# SquaresHQ Deployment Guide

Deploy SquaresHQ for **FREE** using Vercel (frontend) + Render (backend) + Supabase (database).

## Cost Breakdown

| Service | Tier | Cost | Limits |
|---------|------|------|--------|
| Vercel | Hobby | Free | Unlimited deploys |
| Render | Free | Free | Sleeps after 15min inactivity |
| Supabase | Free | Free | 500MB database |
| Resend | Free | Free | 100 emails/day |
| Twilio | Pay-as-you-go | ~$0.008/SMS | Only if you send SMS |

**Total: $0/month** (unless you send SMS notifications)

---

## Step 1: Set Up Database (Supabase)

1. Go to [supabase.com](https://supabase.com) and create an account
2. Click "New Project" and fill in:
   - Project name: `squareshq`
   - Database password: (save this!)
   - Region: Choose closest to your users
3. Once created, go to **Settings > Database**
4. Find **Connection string > URI** and copy it
5. Replace `[YOUR-PASSWORD]` with your database password
6. Save this connection string - you'll need it for Render

**Run migrations**: Go to **SQL Editor** in Supabase and paste the contents of `backend/src/db/migrations/000_full_schema.sql`, then run it.

---

## Step 2: Deploy Backend (Render)

1. Go to [render.com](https://render.com) and sign up with GitHub
2. Click "New" > "Web Service"
3. Connect your GitHub repo (or upload the code)
4. Configure:
   - **Name**: `squareshq-api`
   - **Region**: Oregon (or closest to users)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

5. Add Environment Variables (click "Environment"):
   ```
   DATABASE_URL=<your-supabase-connection-string>
   JWT_SECRET=<generate-a-random-32-char-string>
   NODE_ENV=production
   FRONTEND_URL=https://your-app.vercel.app  (update after Vercel deploy)
   ```

   Optional (for notifications):
   ```
   RESEND_API_KEY=<from-resend.com>
   TWILIO_ACCOUNT_SID=<from-twilio.com>
   TWILIO_AUTH_TOKEN=<from-twilio.com>
   TWILIO_PHONE_NUMBER=<your-twilio-number>
   SITE_PASSWORD=<optional-site-wide-password>
   ```

6. Click "Create Web Service"
7. Wait for deploy - copy your URL (e.g., `https://squareshq-api.onrender.com`)

**Note**: Free tier sleeps after 15 min of inactivity. First request after sleep takes ~30 seconds.

---

## Step 3: Deploy Frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign up with GitHub
2. Click "Add New" > "Project"
3. Import your repo
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. Add Environment Variables:
   - No environment variables needed! API calls go through Vercel rewrites.

6. **Important**: Before deploying, update `frontend/vercel.json`:
   ```json
   {
     "rewrites": [
       {
         "source": "/api/(.*)",
         "destination": "https://squareshq-api.onrender.com/api/$1"
       },
       ...
     ]
   }
   ```
   Replace `https://squareshq-api.onrender.com` with your actual Render URL.

7. Click "Deploy"
8. Copy your Vercel URL (e.g., `https://squareshq.vercel.app`)

---

## Step 4: Update Backend FRONTEND_URL

1. Go back to Render dashboard
2. Open your `squareshq-api` service
3. Go to "Environment"
4. Update `FRONTEND_URL` to your Vercel URL
5. Render will auto-redeploy

---

## Step 5: Set Up Email Notifications (Optional)

1. Go to [resend.com](https://resend.com) and create an account
2. Go to API Keys > Create API Key
3. Add `RESEND_API_KEY` to your Render environment variables

**Note**: Free tier sends from Resend's domain. To use your own domain, verify it in Resend settings.

---

## Step 6: Set Up SMS Notifications (Optional)

1. Go to [twilio.com](https://twilio.com) and create an account
2. Get a phone number (costs ~$1/month + ~$0.008/SMS)
3. Go to Console Dashboard to find:
   - Account SID
   - Auth Token
4. Add these to Render environment variables:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxx
   TWILIO_AUTH_TOKEN=xxxxx
   TWILIO_PHONE_NUMBER=+1234567890
   ```

---

## Testing Your Deployment

1. Visit your Vercel URL
2. Register an admin account
3. Create a test pool
4. Add players and claim squares
5. Verify health check: `https://your-backend.onrender.com/health`

---

## Troubleshooting

### Backend not responding
- Check Render logs for errors
- Verify DATABASE_URL is correct
- Check if the free tier is sleeping (wait 30s)

### Frontend can't connect to API
- Verify vercel.json has correct backend URL
- Check CORS settings (FRONTEND_URL in backend)
- Check browser console for errors

### Database connection fails
- Verify Supabase connection string
- Check if password has special characters (URL encode them)
- Verify IP allowlist in Supabase (should be 0.0.0.0/0 for Render)

### Emails not sending
- Verify RESEND_API_KEY is set
- Check Resend dashboard for delivery status
- Free tier limit is 100/day

---

## Upgrading Later

When you need more power:

| Current | Upgrade | Cost |
|---------|---------|------|
| Render Free | Render Starter | $7/month (no sleep) |
| Supabase Free | Supabase Pro | $25/month (8GB, daily backups) |
| Vercel Hobby | Vercel Pro | $20/month (analytics, team) |

---

## Custom Domain (Optional)

### Vercel (Frontend)
1. Go to Project Settings > Domains
2. Add your domain
3. Update DNS: CNAME to `cname.vercel-dns.com`

### Render (Backend)
1. Go to Service Settings > Custom Domains
2. Add your domain (e.g., `api.yourdomain.com`)
3. Update DNS accordingly

Then update:
- `FRONTEND_URL` in Render
- `vercel.json` rewrites to use your custom API domain
