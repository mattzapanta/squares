# SquaresHQ — Build Spec

## What Is This?

A web app to manage "squares" pools for sports games (NFL, NBA, MLB, NHL, NCAAF, NCAAB, Soccer, custom events). Players claim squares on a 10x10 grid, the admin randomizes digits on the X/Y axes after the board fills, and winners are determined by the last digit of each team's score matching the axis numbers. This is for "fake money" — no real payments, but we track balances like a ledger.

The app solves the admin's #1 pain point: manually texting 50+ people every week to collect picks, track who paid, calculate winners, and send updates. Everything should be automated.

## UI Prototype Reference

See `prototype/squareshq-v2.jsx` — this is a React component showing the full UI design, flow, and interactions. Use it as the visual/UX reference. It has fake data but shows every screen: pools list, create flow (4 steps), grid with randomize animation, score entry with auto-winner calc, player management, ledger, and audit log.

## Tech Stack

- **Frontend:** React + TypeScript (Vite)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (local dev, AWS RDS for prod)
- **Auth:** Simple admin login (email/password with JWT). Players access via tokenized magic links (no login needed).
- **Notifications (ALL FREE):**
  - Email: Resend (free tier = 100 emails/day) — for invites, reminders, winner notifications
  - Web Push: Firebase Cloud Messaging (free) — real-time grid updates, score alerts
  - Shareable links: Token-based URLs texted/emailed to players (sqhq.io/p/{pool-token})
- **Hosting:** Vercel (frontend) + AWS Elastic Beanstalk or Railway (backend) — whatever's cheapest/free
- **Sports Data:** BallDontLie API (free tier) for auto-populating game schedules

## Code Quality Standards

- Enterprise-grade, production-ready code
- Zod validation for all API request bodies
- Proper error handling with meaningful messages
- Database transactions for multi-step operations
- Never commit secrets — use .env
- Modular route structure: routes/pools.ts, routes/players.ts, routes/squares.ts, routes/scores.ts, routes/notifications.ts

## Data Model

```sql
-- Admin users (just the pool creator for now)
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players (across all pools, identified by phone/email)
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  auth_token VARCHAR(64) UNIQUE NOT NULL, -- for magic link access
  banned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT player_contact CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Pools (one per game/event)
CREATE TABLE pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sport VARCHAR(20) NOT NULL, -- nfl, nba, mlb, nhl, ncaaf, ncaab, soccer, custom
  away_team VARCHAR(50) NOT NULL,
  home_team VARCHAR(50) NOT NULL,
  game_date DATE,
  game_time VARCHAR(20),
  game_label VARCHAR(50), -- e.g. "Week 18", "Super Bowl"
  denomination INTEGER NOT NULL, -- dollars per square (1, 5, 10, 25, 50, 100)
  payout_structure VARCHAR(20) NOT NULL DEFAULT 'standard', -- standard, heavy_final, halftime_final, reverse
  tip_pct INTEGER DEFAULT 10, -- suggested tip percentage on winnings
  max_per_player INTEGER DEFAULT 10, -- max squares one player can claim
  ot_rule VARCHAR(20) DEFAULT 'include_final', -- include_final, separate, none
  col_digits INTEGER[], -- randomized 0-9 for X axis (NULL until locked)
  row_digits INTEGER[], -- randomized 0-9 for Y axis (NULL until locked)
  status VARCHAR(20) DEFAULT 'open', -- open, locked, in_progress, final, cancelled, suspended
  locked_at TIMESTAMPTZ,
  external_game_id VARCHAR(100), -- BallDontLie API game ID for auto-scores
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pool-player membership
CREATE TABLE pool_players (
  pool_id UUID REFERENCES pools(id) NOT NULL,
  player_id UUID REFERENCES players(id) NOT NULL,
  paid BOOLEAN DEFAULT false,
  payment_status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, deadbeat
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pool_id, player_id)
);

-- Squares (the 10x10 grid)
CREATE TABLE squares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) NOT NULL,
  row_idx INTEGER NOT NULL CHECK (row_idx >= 0 AND row_idx <= 9),
  col_idx INTEGER NOT NULL CHECK (col_idx >= 0 AND col_idx <= 9),
  player_id UUID REFERENCES players(id), -- NULL = unclaimed
  claimed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ, -- set when admin releases a square
  is_admin_override BOOLEAN DEFAULT false, -- true if changed after lock
  UNIQUE (pool_id, row_idx, col_idx)
);

-- Scores per period
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) NOT NULL,
  period_key VARCHAR(10) NOT NULL, -- q1, q2, q3, q4, ot, h1, h2, p1, p2, p3, etc.
  period_label VARCHAR(20) NOT NULL, -- "Q1", "Halftime", "Final", "OT"
  away_score INTEGER,
  home_score INTEGER,
  payout_pct INTEGER NOT NULL, -- percentage of pool for this period
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  entered_by UUID REFERENCES admins(id),
  UNIQUE (pool_id, period_key)
);

-- Winners (derived from scores + grid + digits)
CREATE TABLE winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id) NOT NULL,
  period_key VARCHAR(10) NOT NULL,
  player_id UUID REFERENCES players(id) NOT NULL,
  square_row INTEGER NOT NULL,
  square_col INTEGER NOT NULL,
  payout_amount INTEGER NOT NULL, -- in dollars
  tip_suggestion INTEGER NOT NULL, -- suggested tip amount
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  UNIQUE (pool_id, period_key)
);

-- Ledger (running balance across pools)
CREATE TABLE ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) NOT NULL,
  pool_id UUID REFERENCES pools(id) NOT NULL,
  type VARCHAR(20) NOT NULL, -- buy_in, payout, tip, refund, adjustment
  amount INTEGER NOT NULL, -- positive = credit, negative = debit
  description VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log (every single action)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID REFERENCES pools(id),
  actor_type VARCHAR(20) NOT NULL, -- admin, player, system
  actor_id UUID, -- admin or player ID
  action VARCHAR(50) NOT NULL, -- square_claimed, square_released, payment_confirmed, grid_locked, etc.
  detail JSONB, -- { row: 3, col: 7, player_name: "Jake", previous_player: "Mike" }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification queue
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) NOT NULL,
  pool_id UUID REFERENCES pools(id),
  channel VARCHAR(20) NOT NULL, -- email, push, both
  type VARCHAR(30) NOT NULL, -- invite, reminder, winner, score_update, grid_locked, payment_reminder, deadbeat_notice
  subject VARCHAR(200),
  body TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, skipped
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_squares_pool ON squares(pool_id);
CREATE INDEX idx_squares_player ON squares(player_id);
CREATE INDEX idx_pool_players_pool ON pool_players(pool_id);
CREATE INDEX idx_ledger_player ON ledger(player_id);
CREATE INDEX idx_audit_pool ON audit_log(pool_id);
CREATE INDEX idx_notifications_status ON notifications(status);
```

## Sports Configuration

Each sport has different scoring periods and rules:

```typescript
const SPORTS_CONFIG = {
  nfl:    { periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: true },
  nba:    { periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: true },
  nhl:    { periods: ["P1","P2","P3"],      periodType: "period",  hasOT: true },
  mlb:    { periods: ["3rd","6th","9th"],   periodType: "inning",  hasOT: false },
  ncaaf:  { periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: true },
  ncaab:  { periods: ["H1","H2"],           periodType: "half",    hasOT: true },
  soccer: { periods: ["H1","H2"],           periodType: "half",    hasOT: true, otLabel: "ET" },
  custom: { periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: false },
};
```

## Payout Structures

```typescript
// "standard" — even split across all periods
// "heavy_final" — 10% each period except last gets remainder
// "halftime_final" — 25% at halftime, 75% at final
// "reverse" — 40% first, 30% second, 20% third, 10% final
```

## API Routes

### Auth
- `POST /api/auth/register` — admin registration
- `POST /api/auth/login` — admin login, returns JWT
- `GET /api/auth/me` — get current admin

### Pools
- `GET /api/pools` — list admin's pools
- `POST /api/pools` — create pool
- `GET /api/pools/:id` — pool detail with grid, players, scores
- `PATCH /api/pools/:id` — update pool settings
- `POST /api/pools/:id/lock` — lock grid, randomize digits
- `POST /api/pools/:id/unlock` — unlock grid (admin override, clears digits)
- `DELETE /api/pools/:id` — cancel pool (with refund flow)

### Squares
- `GET /api/pools/:id/grid` — get full grid state
- `POST /api/pools/:id/squares/claim` — claim square (player via token or admin)
- `POST /api/pools/:id/squares/release` — release square (admin, works even when locked)
- `POST /api/pools/:id/squares/assign` — admin assigns square to player
- `POST /api/pools/:id/squares/swap` — admin swaps two players' squares

### Players
- `GET /api/pools/:id/players` — list pool players with payment status
- `POST /api/pools/:id/players` — add player to pool
- `POST /api/pools/:id/players/bulk` — bulk add (CSV format: name, phone, email)
- `PATCH /api/pools/:id/players/:playerId` — update payment status
- `POST /api/pools/:id/players/:playerId/deadbeat` — mark deadbeat, release all squares
- `POST /api/pools/:id/players/:playerId/reinstate` — un-ban player
- `DELETE /api/pools/:id/players/:playerId` — remove player

### Scores
- `POST /api/pools/:id/scores` — enter/update score for a period
- `GET /api/pools/:id/scores` — get all scores + calculated winners

### Player-Facing (via magic link token)
- `GET /api/p/:token` — get player's view (their pools, grid, balance)
- `POST /api/p/:token/claim` — claim a square
- `GET /api/p/:token/balance` — cross-pool balance

### Notifications
- `POST /api/pools/:id/notify/invite` — send invite to all/specific players
- `POST /api/pools/:id/notify/reminder` — send payment/pick reminders
- `POST /api/pools/:id/notify/results` — send winner notifications with tip suggestion
- `POST /api/pools/:id/notify/blast` — custom message to all players

### Games (BallDontLie integration)
- `GET /api/games/:sport` — fetch upcoming games from API
- `GET /api/games/:sport/:gameId/scores` — fetch live scores

### Audit
- `GET /api/pools/:id/audit` — full audit log for pool

### Ledger
- `GET /api/ledger/:playerId` — cross-pool ledger for player
- `GET /api/pools/:id/ledger` — pool-specific ledger

## Edge Cases — MUST Handle All

### Grid & Board
1. **Race condition on claim**: Two players claim same square simultaneously → Use DB UNIQUE constraint + optimistic locking. Return 409 Conflict with list of available squares.
2. **Player claims but hasn't paid**: Square shows "pending" status with dashed border. Admin can set deadline.
3. **Admin removes player AFTER board locked**: Admin override flag set. Square goes to available. Digits stay locked. New player can claim just that square.
4. **Admin accidentally locks too early**: "Unlock Grid" clears digits, warns that re-randomize will happen on next lock. Requires confirmation.
5. **Board not full by game time**: Partial board mode — unclaimed squares have no owner, those outcomes pay nobody (or admin keeps).
6. **Player wants to swap squares**: Admin-initiated swap endpoint, both parties notified, audit logged.
7. **Player disputes their pick**: Full audit log with timestamps proves who picked what and when.

### Player Management
8. **Deadbeats — picked but won't pay**: "Pending" status with escalating reminders (1hr, 4hr, 24hr). Admin can mark deadbeat which releases ALL their squares and bans them.
9. **Player drops out mid-pool**: Admin removes, squares go back to open. If locked, squares become available via override.
10. **Max squares per player**: Enforced at claim time. Return 400 with max limit info.
11. **Min players to activate pool**: Configurable, warn admin if under threshold at lock time.
12. **Player exists across multiple pools**: Single player record, cross-pool ledger.
13. **Ban list**: Banned from specific pool, not globally. Can be reinstated.
14. **Bulk add failures**: Partial success — return which rows succeeded and which failed with reasons.

### Money & Payouts
15. **Suggested tip on winnings**: Configurable % (0-20%). Shown in winner notification. Tracked in ledger.
16. **Split squares**: Two players can share one square (future feature — flag for later).
17. **Who paid vs who owes**: Payment status tracked per player per pool. Visual indicators everywhere.
18. **Carry-over balances**: Ledger persists across pools for same player.
19. **Pool cancelled**: Status = cancelled. No payouts. Refund entries added to ledger if buy-ins were tracked.
20. **Multiple quarters won by same person**: Consolidated notification — "You won Q1 ($500) and Q3 ($500)! Total: $1,000. Suggested tip: $100."
21. **Payout disputes**: Admin can add "adjustment" ledger entry with note. Audit logged.

### Scores & Sports
22. **Different period counts**: NFL/NBA = 4 quarters, NHL = 3 periods, Soccer/NCAAB = 2 halves, MLB = 3 checkpoints (3rd/6th/9th inning).
23. **Overtime**: Configurable per pool — counts as final score, separate payout, or ignored.
24. **Game postponed**: Pool status = "suspended". Grid stays, no payouts until resumed.
25. **Wrong score entered**: Scores are editable. Winners recalculated. Previous winner notification sent correction. Audit logged.
26. **Auto-score feed fails**: Manual entry always available as fallback. Never block on API.

### Notifications
27. **Delivery failures**: Log error, mark as failed. Admin can see failed notifications and retry.
28. **Player has no email AND no phone**: Can still access via magic link shared by admin. Skip automated notifications.
29. **Opt-out**: Player can reply STOP or unsubscribe. Tracked in player record.
30. **Rate limits**: Resend free tier = 100/day. Queue and batch. Show admin when approaching limit.

### Security
31. **Magic link token guessing**: Use crypto.randomBytes(32) — 256-bit tokens. Rate limit token lookups.
32. **Admin auth**: JWT with expiry. Refresh tokens.
33. **SQL injection**: Parameterized queries only (pg library handles this).
34. **Grid manipulation**: All grid changes go through server validation. Client is display-only.

## Winner Calculation Logic

```typescript
function calculateWinner(pool: Pool, periodKey: string, score: Score): Winner | null {
  if (!pool.col_digits || !pool.row_digits) return null;
  if (score.away_score === null || score.home_score === null) return null;
  
  const awayLastDigit = score.away_score % 10;
  const homeLastDigit = score.home_score % 10;
  
  const col = pool.col_digits.indexOf(awayLastDigit); // X axis = away team
  const row = pool.row_digits.indexOf(homeLastDigit); // Y axis = home team
  
  // Find who owns that square
  const square = await db.squares.findOne({ pool_id: pool.id, row_idx: row, col_idx: col });
  if (!square?.player_id) return null; // unclaimed square, no winner
  
  const payoutPct = getPayoutPercentage(pool.payout_structure, pool.sport, periodKey);
  const poolTotal = 100 * pool.denomination;
  const payoutAmount = Math.round(poolTotal * payoutPct / 100);
  const tipSuggestion = Math.round(payoutAmount * pool.tip_pct / 100);
  
  return { player_id: square.player_id, square_row: row, square_col: col, payout_amount: payoutAmount, tip_suggestion: tipSuggestion };
}
```

## Notification Templates

### Invite
"🎲 You've been invited to {pool_name} — {away} vs {home}, ${denomination} squares! Pick yours: {magic_link}"

### Payment Reminder
"⏰ Hey {name}, you have {count} unpaid squares (${amount}) in {pool_name}. Pay up or they'll be released! {magic_link}"

### Grid Locked
"🔒 {pool_name} grid is LOCKED! Digits randomized. Game time: {game_date} {game_time}. View your squares: {magic_link}"

### Winner
"🏆🎉 You won ${payout_amount} on {period_label} in {pool_name}! ({away} {away_score} - {home} {home_score}). Suggested tip to the house: ${tip_suggestion} ({tip_pct}%). View details: {magic_link}"

### Deadbeat Notice
"🚫 Your squares in {pool_name} have been released due to non-payment. Contact the admin if this is a mistake."

## File Structure

```
squareshq/
├── CLAUDE.md (this file)
├── prototype/
│   └── squareshq-v2.jsx (UI reference)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Grid.tsx
│   │   │   ├── PoolCard.tsx
│   │   │   ├── PlayerList.tsx
│   │   │   ├── ScoreEntry.tsx
│   │   │   ├── Ledger.tsx
│   │   │   ├── AuditLog.tsx
│   │   │   └── CreatePoolFlow.tsx
│   │   ├── pages/
│   │   │   ├── Pools.tsx
│   │   │   ├── PoolDetail.tsx
│   │   │   ├── PlayerView.tsx (magic link view)
│   │   │   └── Login.tsx
│   │   ├── hooks/
│   │   ├── api/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── pools.ts
│   │   │   ├── squares.ts
│   │   │   ├── players.ts
│   │   │   ├── scores.ts
│   │   │   ├── notifications.ts
│   │   │   ├── games.ts
│   │   │   ├── ledger.ts
│   │   │   └── playerPortal.ts (magic link routes)
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── validation.ts
│   │   ├── services/
│   │   │   ├── gridService.ts
│   │   │   ├── winnerService.ts
│   │   │   ├── notificationService.ts
│   │   │   ├── sportsApiService.ts
│   │   │   └── auditService.ts
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   ├── pool.ts
│   │   │   └── index.ts
│   │   ├── config.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## Build Order (for Claude Code)

1. **Backend first**: DB schema, migrations, config
2. **Core API routes**: pools CRUD, squares claim/release, players CRUD
3. **Winner calculation**: score entry → auto-calc → notification trigger
4. **Player portal**: magic link auth, read-only grid view, claim squares
5. **Frontend**: Port prototype to real React + TypeScript with API calls
6. **Notifications**: Resend email integration, FCM push
7. **Sports API**: BallDontLie integration for game schedules
8. **Polish**: Error handling, loading states, mobile responsive

## Environment Variables (.env.example)

```
DATABASE_URL=postgresql://localhost:5432/squareshq
JWT_SECRET=your-jwt-secret-here
RESEND_API_KEY=re_xxxxx
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=xxxxx
FIREBASE_CLIENT_EMAIL=xxxxx
BALLDONTLIE_API_KEY=xxxxx
FRONTEND_URL=http://localhost:5173
BASE_URL=http://localhost:3000
```
