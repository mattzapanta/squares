import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/squareshq',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: '7d',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  },
  ballDontLie: {
    apiKey: process.env.BALLDONTLIE_API_KEY || '',
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
};

export const SPORTS_CONFIG = {
  nfl: { name: 'NFL', icon: '🏈', periods: ['Q1', 'Q2', 'Q3', 'Q4'], periodType: 'quarter', hasOT: true },
  nba: { name: 'NBA', icon: '🏀', periods: ['Q1', 'Q2', 'Q3', 'Q4'], periodType: 'quarter', hasOT: true },
  nhl: { name: 'NHL', icon: '🏒', periods: ['P1', 'P2', 'P3'], periodType: 'period', hasOT: true },
  mlb: { name: 'MLB', icon: '⚾', periods: ['3rd', '6th', '9th'], periodType: 'inning', hasOT: false },
  ncaaf: { name: 'NCAAF', icon: '🏈', periods: ['Q1', 'Q2', 'Q3', 'Q4'], periodType: 'quarter', hasOT: true },
  ncaab: { name: 'NCAAB', icon: '🏀', periods: ['H1', 'H2'], periodType: 'half', hasOT: true },
  soccer: { name: 'Soccer', icon: '⚽', periods: ['H1', 'H2'], periodType: 'half', hasOT: true, otLabel: 'ET' },
  custom: { name: 'Custom', icon: '🎲', periods: ['Q1', 'Q2', 'Q3', 'Q4'], periodType: 'quarter', hasOT: false },
} as const;

export type SportType = keyof typeof SPORTS_CONFIG;
export type PayoutStructure = 'standard' | 'heavy_final' | 'halftime_final' | 'reverse';
export type OTRule = 'include_final' | 'separate' | 'none';
export type PoolStatus = 'open' | 'locked' | 'in_progress' | 'final' | 'cancelled' | 'suspended';
export type PaymentStatus = 'pending' | 'confirmed' | 'deadbeat';
export type NotificationChannel = 'email' | 'push' | 'both';
export type NotificationType = 'invite' | 'reminder' | 'winner' | 'score_update' | 'grid_locked' | 'payment_reminder' | 'deadbeat_notice';
export type LedgerType = 'buy_in' | 'payout' | 'tip' | 'refund' | 'adjustment';
export type ActorType = 'admin' | 'player' | 'system';
