import { useState, useEffect, useRef } from "react";

const C = {
  bg: "#07080C", surface: "#0F1017", surface2: "#161820", hover: "#1C1E2A",
  border: "#252738", green: "#4ADE80", greenGlow: "rgba(74, 222, 128, 0.12)",
  gold: "#FBBF24", red: "#EF4444", blue: "#60A5FA", purple: "#A78BFA",
  pink: "#F472B6", orange: "#FB923C", cyan: "#22D3EE",
  text: "#EEEEF4", muted: "#8889A4", dim: "#4A4B60",
  pending: "#FB923C", confirmed: "#4ADE80", deadbeat: "#EF4444",
};
const F = "'JetBrains Mono', monospace";
const S = "'Inter', -apple-system, sans-serif";

const SPORTS_CONFIG = {
  nfl: { name: "NFL", icon: "🏈", color: "#4ADE80", periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: true },
  nba: { name: "NBA", icon: "🏀", color: "#FB923C", periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: true },
  nhl: { name: "NHL", icon: "🏒", color: "#22D3EE", periods: ["P1","P2","P3"], periodType: "period", hasOT: true },
  mlb: { name: "MLB", icon: "⚾", color: "#60A5FA", periods: ["3rd","6th","9th"], periodType: "inning", hasOT: false },
  ncaaf: { name: "NCAAF", icon: "🏈", color: "#A78BFA", periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: true },
  ncaab: { name: "NCAAB", icon: "🏀", color: "#FBBF24", periods: ["H1","H2"], periodType: "half", hasOT: true },
  soccer: { name: "Soccer", icon: "⚽", color: "#34D399", periods: ["H1","H2"], periodType: "half", hasOT: true, otLabel: "ET" },
  custom: { name: "Custom", icon: "🎲", color: "#F472B6", periods: ["Q1","Q2","Q3","Q4"], periodType: "quarter", hasOT: false },
};

const MOCK_GAMES = {
  nfl: [
    { id: "nfl-1", away: "KC", home: "SF", date: "2026-02-09", time: "1:00 PM", label: "Week 18" },
    { id: "nfl-2", away: "DAL", home: "PHI", date: "2026-02-09", time: "4:25 PM", label: "Week 18" },
    { id: "nfl-3", away: "BUF", home: "MIA", date: "2026-02-09", time: "4:25 PM", label: "Week 18" },
    { id: "nfl-4", away: "DET", home: "GB", date: "2026-02-09", time: "8:20 PM", label: "Week 18" },
  ],
  nba: [
    { id: "nba-1", away: "LAL", home: "GSW", date: "2026-02-09", time: "7:30 PM" },
    { id: "nba-2", away: "BOS", home: "MIL", date: "2026-02-09", time: "8:00 PM" },
    { id: "nba-3", away: "NYK", home: "PHI", date: "2026-02-10", time: "7:00 PM" },
  ],
  nhl: [
    { id: "nhl-1", away: "EDM", home: "VGK", date: "2026-02-09", time: "10:00 PM" },
    { id: "nhl-2", away: "TOR", home: "MTL", date: "2026-02-10", time: "7:00 PM" },
  ],
  mlb: [
    { id: "mlb-1", away: "NYY", home: "BOS", date: "2026-04-01", time: "1:05 PM" },
    { id: "mlb-2", away: "LAD", home: "SF", date: "2026-04-01", time: "4:15 PM" },
  ],
  ncaaf: [{ id: "ncaaf-1", away: "BAMA", home: "UGA", date: "2026-09-05", time: "3:30 PM" }],
  ncaab: [{ id: "ncaab-1", away: "DUKE", home: "UNC", date: "2026-02-12", time: "9:00 PM" }],
  soccer: [{ id: "soc-1", away: "ARS", home: "MCI", date: "2026-02-15", time: "12:30 PM" }],
};

const INITIAL_PLAYERS = [
  { id: 1, name: "Matt R.", phone: "(555) 123-4567", email: "matt@email.com", color: C.green, status: "confirmed", paid: true, banned: false },
  { id: 2, name: "Jake T.", phone: "(555) 234-5678", email: "jake@email.com", color: C.blue, status: "confirmed", paid: true, banned: false },
  { id: 3, name: "Sarah K.", phone: "(555) 345-6789", email: "sarah@email.com", color: C.gold, status: "confirmed", paid: true, banned: false },
  { id: 4, name: "Mike D.", phone: "(555) 456-7890", email: "mike@email.com", color: C.purple, status: "confirmed", paid: false, banned: false },
  { id: 5, name: "Chris P.", phone: "(555) 567-8901", email: "chris@email.com", color: C.pink, status: "pending", paid: false, banned: false },
  { id: 6, name: "Tina W.", phone: "(555) 678-9012", email: "tina@email.com", color: C.orange, status: "confirmed", paid: true, banned: false },
  { id: 7, name: "Devon L.", phone: "(555) 789-0123", email: "devon@email.com", color: C.cyan, status: "confirmed", paid: true, banned: false },
  { id: 8, name: "Alex M.", phone: "(555) 890-1234", email: "alex@email.com", color: "#F87171", status: "deadbeat", paid: false, banned: true },
];

const shuffle = (a) => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; };

const generateGrid = (players) => {
  const grid = Array(10).fill(null).map(() => Array(10).fill(null));
  let idx = 0;
  const activePlayers = players.filter(p => !p.banned && p.status !== "deadbeat");
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if (idx < 95) {
        const p = activePlayers[idx % activePlayers.length];
        grid[r][c] = { ...p, squareStatus: p.paid ? "confirmed" : "pending" };
      }
      idx++;
    }
  }
  return grid;
};

// ── Shared components ──
const Badge = ({ children, color = C.green }) => (
  <span style={{ display:"inline-flex",alignItems:"center",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,letterSpacing:.5,background:`${color}15`,color,border:`1px solid ${color}25`,fontFamily:F,whiteSpace:"nowrap" }}>{children}</span>
);
const Btn = ({ children, primary, danger, small, onClick, disabled, style={} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: danger ? C.red : primary ? C.green : "transparent",
    color: danger ? "#fff" : primary ? C.bg : C.muted,
    border: `1px solid ${danger ? C.red : primary ? C.green : C.border}`,
    borderRadius:8, padding: small?"5px 10px":"8px 16px", fontSize: small?11:12,
    fontWeight:700, cursor: disabled?"not-allowed":"pointer", fontFamily:F,
    letterSpacing:.5, transition:"all 0.15s", opacity: disabled?.4:1, ...style
  }}>{children}</button>
);
const Stat = ({ label, value, sub, accent=C.green }) => (
  <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 16px", flex:1, minWidth:120 }}>
    <div style={{ fontSize:10,color:C.dim,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4,fontFamily:F }}>{label}</div>
    <div style={{ fontSize:22,fontWeight:800,color:accent,fontFamily:F,lineHeight:1.1 }}>{value}</div>
    {sub && <div style={{ fontSize:10,color:C.dim,marginTop:3 }}>{sub}</div>}
  </div>
);
const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 }} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:24,width:"100%",maxWidth:wide?640:440,maxHeight:"85vh",overflowY:"auto" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
        <h3 style={{ fontSize:16,fontWeight:800,fontFamily:F,margin:0 }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18 }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);
const Input = ({ label, ...props }) => (
  <div style={{ marginBottom:12 }}>
    {label && <div style={{ fontSize:10,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:6,fontFamily:F }}>{label}</div>}
    <input {...props} style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:13,fontFamily:S,outline:"none",boxSizing:"border-box", ...props.style }} />
  </div>
);

export default function SquaresHQ() {
  // ── Navigation ──
  const [view, setView] = useState("pools");
  const [tab, setTab] = useState("grid");

  // ── Create flow ──
  const [createStep, setCreateStep] = useState(0);
  const [selSport, setSelSport] = useState(null);
  const [selGame, setSelGame] = useState(null);
  const [customGame, setCustomGame] = useState({ away:"", home:"", date:"", time:"" });
  const [poolCfg, setPoolCfg] = useState({ name:"", denom:25, payout:"standard", tipPct:10, maxPerPlayer:10, minPlayers:10, otRule:"include_final" });
  const [gameSearch, setGameSearch] = useState("");

  // ── Pool detail state ──
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [grid, setGrid] = useState(() => generateGrid(INITIAL_PLAYERS));
  const [colDigits, setColDigits] = useState(null);
  const [rowDigits, setRowDigits] = useState(null);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [hovCell, setHovCell] = useState(null);
  const [selCell, setSelCell] = useState(null);
  const [animIn, setAnimIn] = useState(new Set());
  const [scores, setScores] = useState({});
  const [isLocked, setIsLocked] = useState(false);

  // ── Modals ──
  const [modal, setModal] = useState(null); // 'addPlayer' | 'removePlayer' | 'replacePlayer' | 'managePlayer' | 'payoutDetail' | 'auditLog' | 'overrideSquare' | 'poolSettings'
  const [modalData, setModalData] = useState(null);
  const [newPlayer, setNewPlayer] = useState({ name:"", phone:"", email:"" });
  const [replacementPlayer, setReplacementPlayer] = useState(null);

  // ── Audit log ──
  const [auditLog, setAuditLog] = useState([
    { time: "2:30 PM", action: "Pool created", by: "Admin", detail: "SF vs KC, $25 squares" },
    { time: "2:31 PM", action: "Invite sent", by: "System", detail: "52 players notified via email + push" },
    { time: "2:35 PM", action: "Square claimed", by: "Jake T.", detail: "Claimed (5,2)" },
    { time: "2:40 PM", action: "Payment confirmed", by: "Admin", detail: "Jake T. — 4 squares, $100" },
    { time: "3:01 PM", action: "Square claimed", by: "Mike D.", detail: "Claimed (1,8)" },
    { time: "3:15 PM", action: "Payment reminder", by: "System", detail: "Sent to Mike D. — unpaid 5 squares" },
    { time: "3:30 PM", action: "Player flagged", by: "Admin", detail: "Alex M. marked as deadbeat, 3 squares released" },
  ]);

  const [pools] = useState([
    { id:1, sport:"nfl", away:"SF", home:"KC", denom:25, claimed:95, total:100, locked:false, status:"Open", label:"Super Bowl", players:52 },
    { id:2, sport:"nba", away:"LAL", home:"GSW", denom:10, claimed:72, total:100, locked:false, status:"Open", label:"" , players:28},
    { id:3, sport:"nfl", away:"DAL", home:"PHI", denom:50, claimed:100, total:100, locked:true, status:"Final", label:"Week 17", players:41 },
    { id:4, sport:"nhl", away:"EDM", home:"VGK", denom:100, claimed:100, total:100, locked:true, status:"P2", label:"", players:35 },
  ]);

  useEffect(() => {
    if (view === "pool-detail") {
      const cells = new Set();
      for (let r=0;r<10;r++) for (let c=0;c<10;c++)
        setTimeout(()=>{ cells.add(`${r}-${c}`); setAnimIn(new Set(cells)); }, (r+c)*12);
    }
  }, [view]);

  const sportCfg = SPORTS_CONFIG[selSport?.id] || SPORTS_CONFIG.nfl;
  const currentSportCfg = SPORTS_CONFIG[selSport?.id || "nfl"];
  const awayTeam = selGame?.away || "SF";
  const homeTeam = selGame?.home || "KC";
  const denom = poolCfg.denom || 25;
  const claimedCount = grid.flat().filter(Boolean).length;
  const isFull = claimedCount === 100;
  const pendingCount = grid.flat().filter(c => c?.squareStatus === "pending").length;
  const confirmedCount = grid.flat().filter(c => c?.squareStatus === "confirmed").length;
  const poolTotal = 100 * denom;

  const playerCounts = {};
  grid.flat().filter(Boolean).forEach(p => { playerCounts[p.id] = (playerCounts[p.id] || 0) + 1; });

  const addAudit = (action, detail, by="Admin") => {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
    setAuditLog(prev => [{ time, action, by, detail }, ...prev]);
  };

  // ── Randomize ──
  const doRandomize = () => {
    setIsRandomizing(true);
    const fc = shuffle([0,1,2,3,4,5,6,7,8,9]);
    const fr = shuffle([0,1,2,3,4,5,6,7,8,9]);
    let step = 0;
    const iv = setInterval(()=>{
      step++;
      if (step<20) { setColDigits(shuffle([0,1,2,3,4,5,6,7,8,9])); setRowDigits(shuffle([0,1,2,3,4,5,6,7,8,9])); }
      else { clearInterval(iv); setColDigits(fc); setRowDigits(fr); setIsRandomizing(false); setIsLocked(true); addAudit("Grid locked","Digits randomized and locked"); }
    },80);
  };

  const unlockGrid = () => {
    if (window.confirm("⚠️ Unlocking will RE-RANDOMIZE digits on next lock. Are you sure?")) {
      setColDigits(null); setRowDigits(null); setIsLocked(false); setScores({});
      addAudit("Grid unlocked","Admin unlocked grid — digits will re-randomize on next lock");
    }
  };

  // ── Winner calc ──
  const getWinner = (periodKey) => {
    if (!colDigits || !rowDigits) return null;
    const s = scores[periodKey];
    if (!s?.away || !s?.home) return null;
    const col = colDigits.indexOf(parseInt(s.away) % 10);
    const row = rowDigits.indexOf(parseInt(s.home) % 10);
    if (col===-1||row===-1) return null;
    return grid[row]?.[col] ? { player:grid[row][col], row, col } : null;
  };

  const getPayoutPcts = () => {
    const periods = currentSportCfg.periods;
    const n = periods.length;
    switch(poolCfg.payout) {
      case "standard": return periods.map(()=> Math.floor(100/n));
      case "heavy-final": return periods.map((_,i)=> i===n-1 ? 100-(n-1)*10 : 10);
      case "halftime-final": return periods.map((_,i)=> i===Math.floor(n/2)-1 ? 25 : i===n-1 ? 75 : 0);
      case "reverse": { const weights = [40,30,20,10]; return periods.map((_,i)=> weights[i] || Math.floor(100/n)); }
      default: return periods.map(()=> Math.floor(100/n));
    }
  };

  const getTipSuggestion = (amount) => Math.round(amount * (poolCfg.tipPct / 100));

  // ── Admin: remove player from square ──
  const removeFromSquare = (r, c) => {
    const newGrid = grid.map(row => [...row]);
    const removed = newGrid[r][c];
    newGrid[r][c] = null;
    setGrid(newGrid);
    addAudit("Square released", `(${r},${c}) released — was ${removed?.name}`, "Admin");
    setSelCell(null);
  };

  const assignSquare = (r, c, player) => {
    const newGrid = grid.map(row => [...row]);
    newGrid[r][c] = { ...player, squareStatus: player.paid ? "confirmed" : "pending" };
    setGrid(newGrid);
    addAudit("Square assigned", `(${r},${c}) assigned to ${player.name}`, "Admin");
  };

  const togglePayment = (playerId) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, paid: !p.paid, status: !p.paid ? "confirmed" : "pending" } : p));
    const newGrid = grid.map(row => row.map(cell => cell?.id === playerId ? { ...cell, paid: !cell.paid, squareStatus: !cell.paid ? "confirmed" : "pending" } : cell));
    setGrid(newGrid);
    const player = players.find(p => p.id === playerId);
    addAudit("Payment updated", `${player?.name} — ${player?.paid ? "marked unpaid" : "marked paid"}`, "Admin");
  };

  const markDeadbeat = (playerId) => {
    if (!window.confirm("Mark as deadbeat? Their squares will be released.")) return;
    const player = players.find(p => p.id === playerId);
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, status:"deadbeat", banned:true, paid:false } : p));
    const newGrid = grid.map(row => row.map(cell => cell?.id === playerId ? null : cell));
    setGrid(newGrid);
    addAudit("Player flagged deadbeat", `${player?.name} — ${playerCounts[playerId] || 0} squares released`, "Admin");
    setModal(null);
  };

  const reinstatePlayer = (playerId) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, status:"pending", banned:false } : p));
    const player = players.find(p => p.id === playerId);
    addAudit("Player reinstated", `${player?.name} unbanned — can claim squares again`, "Admin");
  };

  const addNewPlayer = () => {
    if (!newPlayer.name) return;
    const colors = [C.green,C.blue,C.gold,C.purple,C.pink,C.orange,C.cyan,"#F87171","#818CF8","#A3E635"];
    const p = {
      id: Date.now(), name: newPlayer.name, phone: newPlayer.phone, email: newPlayer.email,
      color: colors[players.length % colors.length], status: "pending", paid: false, banned: false,
    };
    setPlayers(prev => [...prev, p]);
    addAudit("Player added", `${p.name} added to pool`, "Admin");
    setNewPlayer({ name:"", phone:"", email:"" });
    setModal(null);
  };

  // ── RENDER: Pools List ──
  const renderPools = () => (
    <div style={{ maxWidth:800, margin:"0 auto", padding:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800, fontFamily:F, margin:0, letterSpacing:-1 }}><span style={{ color:C.green }}>■</span> SquaresHQ</h1>
          <p style={{ color:C.muted, fontSize:13, margin:"4px 0 0" }}>Manage all your squares pools. Zero cost.</p>
        </div>
        <Btn primary onClick={()=>{ setView("create"); setCreateStep(0); setSelSport(null); setSelGame(null); }}>+ NEW POOL</Btn>
      </div>

      {/* Free stack callout */}
      <div style={{ background:C.surface, border:`1px solid ${C.green}20`, borderRadius:10, padding:14, marginBottom:16, display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <Badge color={C.green}>💸 100% FREE STACK</Badge>
        <span style={{ fontSize:11, color:C.muted }}>Web push (FCM) + Email (Resend free tier) + Shareable links — no Twilio needed</span>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {pools.map(pool => {
          const sc = SPORTS_CONFIG[pool.sport];
          return (
            <div key={pool.id} onClick={()=>{ setView("pool-detail"); setTab("grid"); setSelGame({away:pool.away,home:pool.home}); setPoolCfg(p=>({...p,denom:pool.denom})); setSelSport({id:pool.sport}); setIsLocked(pool.locked); if(pool.locked){setColDigits(shuffle([0,1,2,3,4,5,6,7,8,9]));setRowDigits(shuffle([0,1,2,3,4,5,6,7,8,9]));} }}
              style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 20px", cursor:"pointer", transition:"all 0.15s", display:"flex", justifyContent:"space-between", alignItems:"center" }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.green+"60"} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:44,height:44,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:`${sc.color}12`,fontSize:22 }}>{sc.icon}</div>
                <div>
                  <div style={{ fontSize:15,fontWeight:700,color:C.text }}>{pool.away} vs {pool.home}</div>
                  <div style={{ fontSize:12,color:C.muted }}>{sc.name} {pool.label&&`• ${pool.label}`} • ${pool.denom}/sq • {pool.players} players</div>
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:13,fontWeight:700,fontFamily:F,color:pool.claimed===100?C.green:C.gold }}>{pool.claimed}/100</div>
                  <div style={{ fontSize:10,color:C.dim }}>claimed</div>
                </div>
                <Badge color={pool.status==="Open"?C.blue:pool.status==="Final"?C.dim:C.green}>{pool.status}</Badge>
                <span style={{ color:C.dim,fontSize:18 }}>›</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── RENDER: Create Flow ──
  const renderCreate = () => {
    const steps = ["Sport","Game","Settings","Confirm"];
    return (
      <div style={{ maxWidth:640, margin:"0 auto", padding:24 }}>
        <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:24 }}>
          <button onClick={()=>setView("pools")} style={{ background:"none",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"6px 10px",cursor:"pointer",fontSize:12 }}>← Back</button>
          <h2 style={{ fontSize:18,fontWeight:800,fontFamily:F,margin:0 }}>New Pool</h2>
        </div>
        <div style={{ display:"flex",gap:2,marginBottom:28 }}>
          {steps.map((s,i)=>(
            <div key={s} style={{ flex:1 }}>
              <div style={{ height:3,borderRadius:2,background:i<=createStep?C.green:C.border,transition:"all 0.3s",marginBottom:6 }} />
              <span style={{ fontSize:10,fontWeight:700,color:i<=createStep?C.green:C.dim,fontFamily:F }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Step 0: Sport */}
        {createStep===0 && (
          <div>
            <h3 style={{ fontSize:14,fontWeight:700,color:C.text,marginBottom:16 }}>What sport?</h3>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8 }}>
              {Object.entries(SPORTS_CONFIG).map(([id, cfg])=>(
                <div key={id} onClick={()=>{setSelSport({id});setCreateStep(1);setSelGame(null);setGameSearch("");}}
                  style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 14px",cursor:"pointer",textAlign:"center",transition:"all 0.15s" }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=cfg.color+"80"} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{ fontSize:28,marginBottom:6 }}>{cfg.icon}</div>
                  <div style={{ fontSize:13,fontWeight:700,color:C.text }}>{cfg.name}</div>
                  <div style={{ fontSize:10,color:C.dim,marginTop:2 }}>{cfg.periods.join(" • ")}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Game */}
        {createStep===1 && (
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <h3 style={{ fontSize:14,fontWeight:700,margin:0 }}>{selSport?.id==="custom"?"Custom Event":`Select ${currentSportCfg.name} Game`}</h3>
              <button onClick={()=>setCreateStep(0)} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12 }}>← Back</button>
            </div>
            {selSport?.id==="custom" ? (
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:10,fontFamily:F }}>MATCHUP</div>
                  <div style={{ display:"flex",gap:12,alignItems:"center" }}>
                    <input placeholder="Away" value={customGame.away} onChange={e=>setCustomGame({...customGame,away:e.target.value})}
                      style={{ flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,fontWeight:700,fontFamily:F,outline:"none",textTransform:"uppercase" }} />
                    <span style={{ color:C.dim,fontWeight:700,fontSize:12 }}>vs</span>
                    <input placeholder="Home" value={customGame.home} onChange={e=>setCustomGame({...customGame,home:e.target.value})}
                      style={{ flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:14,fontWeight:700,fontFamily:F,outline:"none",textTransform:"uppercase" }} />
                  </div>
                  <div style={{ display:"flex",gap:12,marginTop:12 }}>
                    <input type="date" value={customGame.date} onChange={e=>setCustomGame({...customGame,date:e.target.value})}
                      style={{ flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:12,fontFamily:F,outline:"none" }} />
                    <input type="time" value={customGame.time} onChange={e=>setCustomGame({...customGame,time:e.target.value})}
                      style={{ flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:12,fontFamily:F,outline:"none" }} />
                  </div>
                </div>
                <Btn primary disabled={!customGame.away||!customGame.home} onClick={()=>{
                  setSelGame({id:"custom",away:customGame.away.toUpperCase(),home:customGame.home.toUpperCase(),date:customGame.date,time:customGame.time});
                  setPoolCfg({...poolCfg,name:`${customGame.away.toUpperCase()} vs ${customGame.home.toUpperCase()}`});
                  setCreateStep(2);
                }} style={{ width:"100%" }}>Continue →</Btn>
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <div style={{ position:"relative",marginBottom:4 }}>
                  <input placeholder="Search teams..." value={gameSearch} onChange={e=>setGameSearch(e.target.value)}
                    style={{ width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px 10px 36px",color:C.text,fontSize:13,fontFamily:S,outline:"none",boxSizing:"border-box" }} />
                  <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.dim,fontSize:14 }}>🔍</span>
                </div>
                <div style={{ fontSize:10,color:C.dim,fontFamily:F,display:"flex",alignItems:"center",gap:6,marginBottom:4 }}>
                  <span style={{ width:6,height:6,borderRadius:"50%",background:C.green,display:"inline-block" }} /> Live from BallDontLie API
                </div>
                {(MOCK_GAMES[selSport?.id]||[]).filter(g=>!gameSearch||`${g.away} ${g.home}`.toLowerCase().includes(gameSearch.toLowerCase())).map(game=>(
                  <div key={game.id} onClick={()=>{setSelGame(game);setPoolCfg({...poolCfg,name:`${game.away} vs ${game.home}`});setCreateStep(2);}}
                    style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s",display:"flex",justifyContent:"space-between",alignItems:"center" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=currentSportCfg.color+"60"} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:16,fontWeight:800,fontFamily:F }}>{game.away}</span>
                      <span style={{ fontSize:11,color:C.dim }}>@</span>
                      <span style={{ fontSize:16,fontWeight:800,fontFamily:F }}>{game.home}</span>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:12,color:C.muted }}>{game.date}</div>
                      <div style={{ fontSize:11,color:C.dim }}>{game.time} {game.label?`• ${game.label}`:""}</div>
                    </div>
                  </div>
                ))}
                <div onClick={()=>setSelSport({id:"custom"})} style={{ background:"transparent",border:`1px dashed ${C.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",textAlign:"center" }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.muted} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <span style={{ fontSize:12,color:C.muted }}>Don't see your game? </span><span style={{ fontSize:12,color:C.green,fontWeight:700 }}>Enter manually →</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Settings */}
        {createStep===2 && (
          <div>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
              <h3 style={{ fontSize:14,fontWeight:700,margin:0 }}>Pool Settings</h3>
              <button onClick={()=>setCreateStep(1)} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12 }}>← Back</button>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
              {/* Game preview */}
              <div style={{ background:C.surface,border:`1px solid ${C.green}30`,borderRadius:10,padding:14,display:"flex",alignItems:"center",gap:12 }}>
                <span style={{ fontSize:22 }}>{currentSportCfg.icon}</span>
                <div>
                  <div style={{ fontSize:15,fontWeight:800,fontFamily:F }}>{selGame?.away} vs {selGame?.home}</div>
                  <div style={{ fontSize:11,color:C.muted }}>{selGame?.date} • {currentSportCfg.periods.join(", ")} {currentSportCfg.hasOT&&"+ OT"}</div>
                </div>
              </div>

              <Input label="POOL NAME" value={poolCfg.name} onChange={e=>setPoolCfg({...poolCfg,name:e.target.value})} />

              {/* Denomination */}
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
                <div style={{ fontSize:10,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:10,fontFamily:F }}>DENOMINATION</div>
                <div style={{ display:"flex",gap:6 }}>
                  {[1,5,10,25,50,100].map(d=>(
                    <button key={d} onClick={()=>setPoolCfg({...poolCfg,denom:d})} style={{
                      flex:1,padding:"12px 0",borderRadius:8,fontWeight:800,fontSize:d>=100?14:16,fontFamily:F,cursor:"pointer",
                      background:poolCfg.denom===d?C.green:C.bg,color:poolCfg.denom===d?C.bg:C.muted,border:`1px solid ${poolCfg.denom===d?C.green:C.border}`,
                    }}>${d}</button>
                  ))}
                </div>
                <div style={{ fontSize:11,color:C.dim,marginTop:8,textAlign:"center" }}>
                  Pool: <span style={{ color:C.green,fontWeight:700,fontFamily:F }}>${poolCfg.denom*100}</span>
                </div>
              </div>

              {/* Payout structure */}
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
                <div style={{ fontSize:10,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:10,fontFamily:F }}>PAYOUT STRUCTURE</div>
                {[
                  { id:"standard", name:"Even Split", desc:`${Math.floor(100/currentSportCfg.periods.length)}% each ${currentSportCfg.periodType}` },
                  { id:"heavy-final", name:"Heavy Final", desc:`10% each, rest to final` },
                  { id:"halftime-final", name:"Half + Final", desc:`25% half, 75% final` },
                ].map(p=>(
                  <div key={p.id} onClick={()=>setPoolCfg({...poolCfg,payout:p.id})} style={{
                    display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderRadius:8,marginBottom:4,cursor:"pointer",
                    background:poolCfg.payout===p.id?`${C.green}10`:"transparent",border:`1px solid ${poolCfg.payout===p.id?C.green+"40":"transparent"}`,
                  }}>
                    <div><div style={{ fontSize:13,fontWeight:700,color:C.text }}>{p.name}</div><div style={{ fontSize:11,color:C.dim }}>{p.desc}</div></div>
                    <div style={{ width:18,height:18,borderRadius:"50%",border:`2px solid ${poolCfg.payout===p.id?C.green:C.border}`,display:"flex",alignItems:"center",justifyContent:"center" }}>
                      {poolCfg.payout===p.id && <div style={{ width:10,height:10,borderRadius:"50%",background:C.green }} />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tip suggestion */}
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
                <div style={{ fontSize:10,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:10,fontFamily:F }}>SUGGESTED TIP % ON WINNINGS</div>
                <div style={{ display:"flex",gap:6 }}>
                  {[0,5,10,15,20].map(t=>(
                    <button key={t} onClick={()=>setPoolCfg({...poolCfg,tipPct:t})} style={{
                      flex:1,padding:"10px 0",borderRadius:8,fontWeight:800,fontSize:14,fontFamily:F,cursor:"pointer",
                      background:poolCfg.tipPct===t?C.gold:C.bg,color:poolCfg.tipPct===t?C.bg:C.muted,border:`1px solid ${poolCfg.tipPct===t?C.gold:C.border}`,
                    }}>{t}%</button>
                  ))}
                </div>
                <div style={{ fontSize:11,color:C.dim,marginTop:8,textAlign:"center" }}>
                  e.g. Win ${poolCfg.denom*100*0.25} → Suggested tip: <span style={{ color:C.gold,fontWeight:700 }}>${getTipSuggestion(poolCfg.denom*100*0.25)}</span>
                </div>
              </div>

              {/* Guard rails */}
              <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
                <div style={{ fontSize:10,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:10,fontFamily:F }}>GUARD RAILS</div>
                <div style={{ display:"flex",gap:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10,color:C.dim,marginBottom:4 }}>Max squares/player</div>
                    <select value={poolCfg.maxPerPlayer} onChange={e=>setPoolCfg({...poolCfg,maxPerPlayer:+e.target.value})}
                      style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:13,fontFamily:F,outline:"none" }}>
                      {[5,10,15,20,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10,color:C.dim,marginBottom:4 }}>OT Rule</div>
                    <select value={poolCfg.otRule} onChange={e=>setPoolCfg({...poolCfg,otRule:e.target.value})}
                      style={{ width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.text,fontSize:13,fontFamily:F,outline:"none" }}>
                      <option value="include_final">OT counts as final</option>
                      <option value="separate">OT = separate payout</option>
                      <option value="none">No OT payout</option>
                    </select>
                  </div>
                </div>
              </div>

              <Btn primary onClick={()=>setCreateStep(3)} style={{ width:"100%" }}>Review & Create →</Btn>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {createStep===3 && (
          <div>
            <h3 style={{ fontSize:14,fontWeight:700,marginBottom:16 }}>Confirm & Launch</h3>
            <div style={{ background:C.surface,border:`1px solid ${C.green}30`,borderRadius:12,padding:20,marginBottom:16 }}>
              <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
                <span style={{ fontSize:32 }}>{currentSportCfg.icon}</span>
                <div>
                  <div style={{ fontSize:20,fontWeight:800,fontFamily:F }}>{poolCfg.name}</div>
                  <div style={{ fontSize:12,color:C.muted }}>{selGame?.date} • {currentSportCfg.periods.length} {currentSportCfg.periodType}s</div>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
                {[{l:"Per Square",v:`$${poolCfg.denom}`,c:C.green},{l:"Pool Total",v:`$${poolCfg.denom*100}`,c:C.gold},{l:"Tip Rate",v:`${poolCfg.tipPct}%`,c:C.orange}].map(s=>(
                  <div key={s.l} style={{ background:C.bg,borderRadius:8,padding:12 }}>
                    <div style={{ fontSize:10,color:C.dim,fontFamily:F,letterSpacing:1 }}>{s.l}</div>
                    <div style={{ fontSize:20,fontWeight:800,color:s.c,fontFamily:F }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:16 }}>
              <div style={{ fontSize:10,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:10,fontFamily:F }}>SYSTEM WILL AUTOMATICALLY</div>
              {["📧 Email all players the grid link (free via Resend)","🔔 Push notify via FCM when squares are picked","⏰ Auto-remind unpaid players every 24hrs","🔒 Lock grid & randomize X/Y when full","📊 Auto-calculate winners on score entry",`💰 Include ${poolCfg.tipPct}% tip suggestion in win notifications`,"📝 Full audit log of every action"].map((item,i)=>(
                <div key={i} style={{ fontSize:12,color:C.muted,padding:"5px 0" }}>{item}</div>
              ))}
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <Btn onClick={()=>setCreateStep(2)} style={{ flex:1 }}>← Back</Btn>
              <Btn primary onClick={()=>{setView("pool-detail");setTab("grid");}} style={{ flex:2 }}>🚀 Create & Notify</Btn>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── RENDER: Grid ──
  const renderGrid = () => {
    const payoutPcts = getPayoutPcts();
    return (
      <div>
        {/* Controls */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8 }}>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
            <Badge color={C.green}>{confirmedCount} confirmed</Badge>
            {pendingCount>0 && <Badge color={C.pending}>⚠ {pendingCount} unpaid</Badge>}
            <Badge color={isFull?C.green:C.gold}>{claimedCount}/100</Badge>
            {isLocked && <Badge color={C.green}>🔒 LOCKED</Badge>}
          </div>
          <div style={{ display:"flex",gap:6 }}>
            {isFull && !isLocked && <Btn primary small onClick={doRandomize} disabled={isRandomizing}>{isRandomizing?"🎰 Randomizing...":"🎲 Lock & Randomize"}</Btn>}
            {isLocked && <Btn small danger onClick={unlockGrid}>🔓 Unlock</Btn>}
          </div>
        </div>

        {/* Pending payment warning */}
        {pendingCount > 0 && (
          <div style={{ background:`${C.pending}10`,border:`1px solid ${C.pending}30`,borderRadius:8,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ fontSize:12,color:C.pending }}>⚠ <strong>{pendingCount} squares</strong> have unpaid players. Mark as paid or remove before locking.</div>
            <Btn small onClick={()=>setTab("players")} style={{ borderColor:C.pending,color:C.pending }}>Manage →</Btn>
          </div>
        )}

        {/* Grid */}
        <div style={{ overflowX:"auto",paddingBottom:8 }}>
          <div style={{ display:"inline-block",minWidth:560 }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"center",marginBottom:6,marginLeft:40 }}>
              <span style={{ fontSize:12,fontWeight:800,color:C.blue,letterSpacing:2,fontFamily:F }}>← {awayTeam} →</span>
            </div>
            <div style={{ display:"flex",marginLeft:40 }}>
              {(colDigits||Array(10).fill("?")).map((d,i)=>(
                <div key={i} style={{ width:46,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:colDigits?C.blue:C.dim,fontFamily:F }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"flex" }}>
              <div style={{ display:"flex",alignItems:"stretch" }}>
                <div style={{ display:"flex",alignItems:"center",marginRight:2 }}>
                  <span style={{ fontSize:12,fontWeight:800,color:C.gold,letterSpacing:2,fontFamily:F,writingMode:"vertical-lr",transform:"rotate(180deg)" }}>← {homeTeam} →</span>
                </div>
                <div style={{ display:"flex",flexDirection:"column" }}>
                  {(rowDigits||Array(10).fill("?")).map((d,i)=>(
                    <div key={i} style={{ width:20,height:46,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:rowDigits?C.gold:C.dim,fontFamily:F }}>{d}</div>
                  ))}
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(10,46px)",gap:2,background:C.border,padding:2,borderRadius:8,border:`1px solid ${C.border}` }}>
                {grid.map((row,r)=>row.map((cell,c)=>{
                  const isHov = hovCell?.r===r&&hovCell?.c===c;
                  const isSel = selCell?.r===r&&selCell?.c===c;
                  const isPending = cell?.squareStatus==="pending";
                  const isWin = currentSportCfg.periods.some((_,i)=>{ const w=getWinner(`p${i}`); return w&&w.row===r&&w.col===c; });
                  const isVis = animIn.has(`${r}-${c}`);
                  return (
                    <div key={`${r}-${c}`}
                      onClick={()=>{ setSelCell({r,c,player:cell}); if(cell){ setModalData({r,c,player:cell}); setModal("manageSquare"); } }}
                      onMouseEnter={()=>setHovCell({r,c})} onMouseLeave={()=>setHovCell(null)}
                      style={{
                        width:46,height:46,display:"flex",alignItems:"center",justifyContent:"center",
                        background: isWin?`${C.gold}20`:cell? isPending?`${C.pending}10`:isSel?`${cell.color}30`:isHov?`${cell.color}15`:`${cell.color}08` : isHov?C.hover:C.surface,
                        border: isWin?`2px solid ${C.gold}`:isPending?`1px dashed ${C.pending}60`:isSel?`2px solid ${cell.color}`:`1px solid ${cell?`${cell.color}18`:"transparent"}`,
                        borderRadius:3,cursor:"pointer",transition:"all 0.12s",opacity:isVis?1:0,transform:isVis?"scale(1)":"scale(0.85)",position:"relative",
                      }}>
                      {cell ? (
                        <span style={{ fontSize:9,fontWeight:800,color:isPending?C.pending:cell.color,fontFamily:F }}>{cell.name.split(" ")[0].substring(0,3).toUpperCase()}</span>
                      ) : (
                        <span style={{ fontSize:10,color:C.dim }}>+</span>
                      )}
                      {isWin && <div style={{ position:"absolute",top:-3,right:-3,fontSize:10 }}>🏆</div>}
                      {isPending && <div style={{ position:"absolute",bottom:1,right:2,fontSize:7,color:C.pending }}>$?</div>}
                    </div>
                  );
                }))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap",alignItems:"center" }}>
          {players.filter(p=>!p.banned).map(p=>(
            <div key={p.id} style={{ display:"flex",alignItems:"center",gap:3 }}>
              <div style={{ width:8,height:8,borderRadius:2,background:`${p.color}50`,border:`1px solid ${p.color}` }} />
              <span style={{ fontSize:10,color:p.paid?C.muted:C.pending }}>{p.name.split(" ")[0]} ({playerCounts[p.id]||0}){!p.paid&&" 💸"}</span>
            </div>
          ))}
          <div style={{ display:"flex",alignItems:"center",gap:3 }}>
            <div style={{ width:8,height:8,borderRadius:2,border:`1px dashed ${C.pending}` }} />
            <span style={{ fontSize:10,color:C.dim }}>= unpaid</span>
          </div>
        </div>

        {/* Score entry + payouts */}
        {isLocked && (
          <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16,marginTop:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
              <span style={{ fontSize:11,fontWeight:700,color:C.dim,letterSpacing:1,fontFamily:F }}>SCORES & PAYOUTS</span>
              <Badge color={C.blue}>X/Y LOCKED</Badge>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:`repeat(${currentSportCfg.periods.length},1fr)`,gap:8 }}>
              {currentSportCfg.periods.map((period,i)=>{
                const key = `p${i}`;
                const winner = getWinner(key);
                const pct = payoutPcts[i];
                const payout = Math.round(poolTotal * pct / 100);
                const tip = getTipSuggestion(payout);
                return (
                  <div key={key} style={{ background:C.bg,borderRadius:8,padding:10 }}>
                    <div style={{ fontSize:10,fontWeight:700,color:C.dim,fontFamily:F,marginBottom:6,textAlign:"center" }}>
                      {period} <span style={{ color:C.green }}>({pct}%)</span>
                    </div>
                    <div style={{ display:"flex",gap:4 }}>
                      <input placeholder={awayTeam} value={scores[key]?.away||""} onChange={e=>setScores({...scores,[key]:{...scores[key],away:e.target.value}})}
                        style={{ width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 4px",color:C.blue,fontSize:14,fontWeight:800,fontFamily:F,outline:"none",textAlign:"center" }} />
                      <input placeholder={homeTeam} value={scores[key]?.home||""} onChange={e=>setScores({...scores,[key]:{...scores[key],home:e.target.value}})}
                        style={{ width:"100%",background:C.surface,border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 4px",color:C.gold,fontSize:14,fontWeight:800,fontFamily:F,outline:"none",textAlign:"center" }} />
                    </div>
                    {winner ? (
                      <div style={{ textAlign:"center",marginTop:6 }}>
                        <div style={{ fontSize:11,fontWeight:700,color:C.green,fontFamily:F }}>🏆 {winner.player.name}</div>
                        <div style={{ fontSize:12,fontWeight:800,color:C.gold,fontFamily:F }}>${payout.toLocaleString()}</div>
                        {tip > 0 && <div style={{ fontSize:9,color:C.orange }}>Suggested tip: ${tip}</div>}
                      </div>
                    ) : (
                      <div style={{ textAlign:"center",marginTop:6,fontSize:10,color:C.dim }}>
                        Payout: ${payout.toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Payout notification preview */}
            {currentSportCfg.periods.some((_,i)=>getWinner(`p${i}`)) && (
              <div style={{ background:`${C.green}08`,border:`1px solid ${C.green}20`,borderRadius:8,padding:12,marginTop:12 }}>
                <div style={{ fontSize:10,fontWeight:700,color:C.green,letterSpacing:1,marginBottom:6,fontFamily:F }}>📧 WINNER NOTIFICATION PREVIEW</div>
                {currentSportCfg.periods.map((_,i)=>{
                  const w = getWinner(`p${i}`);
                  if (!w) return null;
                  const pct = payoutPcts[i];
                  const payout = Math.round(poolTotal * pct / 100);
                  const tip = getTipSuggestion(payout);
                  return (
                    <div key={i} style={{ fontSize:12,color:C.muted,padding:"4px 0",lineHeight:1.5 }}>
                      <strong style={{ color:C.text }}>To {w.player.name}:</strong> "🎉 You won <strong style={{ color:C.gold }}>${payout.toLocaleString()}</strong> on {currentSportCfg.periods[i]} in {awayTeam} vs {homeTeam}!
                      {tip > 0 && <> Suggested tip to the house: <strong style={{ color:C.orange }}>${tip}</strong> ({poolCfg.tipPct}%)</>}. View pool: sqhq.io/p/..."
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── RENDER: Players Tab ──
  const renderPlayers = () => (
    <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:12,fontWeight:700,color:C.dim,fontFamily:F }}>{players.length} PLAYERS</span>
        <div style={{ display:"flex",gap:6 }}>
          <Btn small onClick={()=>{setModal("addPlayer");setNewPlayer({name:"",phone:"",email:""});}}>+ Add Player</Btn>
          <Btn small onClick={()=>setModal("bulkAdd")}>📋 Bulk Add</Btn>
        </div>
      </div>

      {/* Active players */}
      {players.filter(p=>!p.banned).map(p=>{
        const count = playerCounts[p.id]||0;
        return (
          <div key={p.id} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:`${p.color}20`,color:p.color,fontSize:11,fontWeight:800 }}>{p.name[0]}</div>
              <div>
                <div style={{ fontSize:13,fontWeight:700,color:C.text }}>{p.name}</div>
                <div style={{ fontSize:10,color:C.dim,fontFamily:F }}>{p.phone || p.email}</div>
              </div>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <div style={{ textAlign:"right",marginRight:4 }}>
                <div style={{ fontSize:12,fontWeight:700,fontFamily:F,color:p.color }}>{count} sq</div>
                <div style={{ fontSize:10,color:C.dim }}>${count*denom}</div>
              </div>
              <Badge color={p.paid?C.green:C.pending}>{p.paid?"PAID":"UNPAID"}</Badge>
              <button onClick={()=>togglePayment(p.id)} style={{ background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,color:C.muted,fontFamily:F }}>
                {p.paid?"Mark Unpaid":"Mark Paid"}
              </button>
              <button onClick={()=>{setModalData(p);setModal("managePlayer");}} style={{ background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:10,color:C.muted }}>⋯</button>
            </div>
          </div>
        );
      })}

      {/* Banned/deadbeat section */}
      {players.filter(p=>p.banned).length > 0 && (
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:11,fontWeight:700,color:C.red,letterSpacing:1,marginBottom:8,fontFamily:F }}>🚫 BANNED / DEADBEAT</div>
          {players.filter(p=>p.banned).map(p=>(
            <div key={p.id} style={{ background:`${C.red}08`,border:`1px solid ${C.red}20`,borderRadius:10,padding:"10px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:13,fontWeight:700,color:C.red }}>{p.name}</span>
                <Badge color={C.red}>DEADBEAT</Badge>
              </div>
              <Btn small onClick={()=>reinstatePlayer(p.id)} style={{ borderColor:C.green,color:C.green }}>Reinstate</Btn>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── RENDER: Audit Log ──
  const renderAudit = () => (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
      <div style={{ fontSize:11,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:12,fontFamily:F }}>AUDIT LOG — FULL HISTORY</div>
      {auditLog.map((entry,i)=>(
        <div key={i} style={{ display:"flex",gap:10,padding:"8px 0",borderBottom:i<auditLog.length-1?`1px solid ${C.border}08`:"none" }}>
          <div style={{ fontSize:10,color:C.dim,fontFamily:F,minWidth:60,flexShrink:0 }}>{entry.time}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.text }}>{entry.action}</div>
            <div style={{ fontSize:11,color:C.muted }}>{entry.detail}</div>
          </div>
          <Badge color={entry.by==="System"?C.blue:entry.by==="Admin"?C.green:C.muted} style={{ alignSelf:"flex-start" }}>{entry.by}</Badge>
        </div>
      ))}
    </div>
  );

  // ── RENDER: Ledger ──
  const renderLedger = () => (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:16 }}>
      <div style={{ fontSize:11,fontWeight:700,color:C.dim,letterSpacing:1,marginBottom:14,fontFamily:F }}>LEDGER</div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%",borderCollapse:"collapse" }}>
          <thead><tr>
            {["Player","Squares","Buy-In","Winnings","Tips","Net"].map(h=>(
              <th key={h} style={{ textAlign:h==="Player"?"left":"right",padding:"6px 10px",fontSize:9,fontWeight:700,color:C.dim,letterSpacing:1,borderBottom:`1px solid ${C.border}`,fontFamily:F,textTransform:"uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {players.filter(p=>!p.banned).map(p=>{
              const count = playerCounts[p.id]||0;
              const buyIn = count*denom;
              const winnings = currentSportCfg.periods.reduce((sum,_,i)=>{
                const w = getWinner(`p${i}`);
                if (w?.player.id===p.id) { const pct=getPayoutPcts()[i]; return sum+Math.round(poolTotal*pct/100); }
                return sum;
              },0);
              const tips = getTipSuggestion(winnings);
              const net = winnings - buyIn - tips;
              return (
                <tr key={p.id}>
                  <td style={{ padding:"8px 10px" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <div style={{ width:20,height:20,borderRadius:"50%",background:`${p.color}20`,color:p.color,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center" }}>{p.name[0]}</div>
                      <span style={{ fontSize:12,fontWeight:700,color:C.text }}>{p.name}</span>
                      {!p.paid && <Badge color={C.pending}>UNPAID</Badge>}
                    </div>
                  </td>
                  <td style={{ textAlign:"right",padding:"8px 10px",fontSize:12,fontFamily:F,color:C.muted }}>{count}</td>
                  <td style={{ textAlign:"right",padding:"8px 10px",fontSize:12,fontFamily:F,color:C.red }}>-${buyIn}</td>
                  <td style={{ textAlign:"right",padding:"8px 10px",fontSize:12,fontFamily:F,color:winnings>0?C.green:C.dim }}>{winnings>0?`+$${winnings}`:"—"}</td>
                  <td style={{ textAlign:"right",padding:"8px 10px",fontSize:12,fontFamily:F,color:tips>0?C.orange:C.dim }}>{tips>0?`-$${tips}`:"—"}</td>
                  <td style={{ textAlign:"right",padding:"8px 10px",fontSize:13,fontWeight:800,fontFamily:F,color:net>0?C.green:net<0?C.red:C.dim }}>{net>0?"+":""}${net}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Pool Detail ──
  const renderPoolDetail = () => (
    <div style={{ maxWidth:840,margin:"0 auto",padding:24 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8 }}>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <button onClick={()=>{setView("pools");setIsLocked(false);setColDigits(null);setRowDigits(null);setScores({});}} style={{ background:"none",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"6px 10px",cursor:"pointer",fontSize:12 }}>← Pools</button>
          <div>
            <div style={{ fontSize:18,fontWeight:800,fontFamily:F }}><span style={{ color:C.green }}>■</span> {awayTeam} vs {homeTeam}</div>
            <div style={{ fontSize:11,color:C.muted }}>{currentSportCfg.name} • ${denom}/sq • {currentSportCfg.periods.length} {currentSportCfg.periodType}s</div>
          </div>
        </div>
        <Badge>ADMIN</Badge>
      </div>

      <div style={{ display:"flex",gap:8,marginBottom:16,flexWrap:"wrap" }}>
        <Stat label="Pool" value={`$${poolTotal.toLocaleString()}`} />
        <Stat label="Claimed" value={`${claimedCount}%`} accent={isFull?C.green:C.gold} sub={pendingCount>0?`${pendingCount} unpaid`:undefined} />
        <Stat label="Players" value={players.filter(p=>!p.banned).length} accent={C.blue} />
        <Stat label="Status" value={isLocked?"Locked":isFull?"Ready":"Open"} accent={isLocked?C.green:C.gold} />
      </div>

      <div style={{ display:"flex",gap:6,marginBottom:16,borderBottom:`1px solid ${C.border}`,paddingBottom:10,overflowX:"auto" }}>
        {[{id:"grid",label:"GRID"},{id:"players",label:`PLAYERS (${players.filter(p=>!p.banned).length})`},{id:"ledger",label:"LEDGER"},{id:"audit",label:"AUDIT LOG"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            background:tab===t.id?C.green:"transparent",color:tab===t.id?C.bg:C.muted,
            border:`1px solid ${tab===t.id?C.green:C.border}`,borderRadius:6,padding:"6px 14px",
            fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F,letterSpacing:.5,whiteSpace:"nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      {tab==="grid" && renderGrid()}
      {tab==="players" && renderPlayers()}
      {tab==="ledger" && renderLedger()}
      {tab==="audit" && renderAudit()}

      {/* ── Modals ── */}
      {modal==="addPlayer" && (
        <Modal title="Add Player" onClose={()=>setModal(null)}>
          <Input label="NAME *" placeholder="e.g. John Smith" value={newPlayer.name} onChange={e=>setNewPlayer({...newPlayer,name:e.target.value})} />
          <Input label="PHONE" placeholder="(555) 123-4567" value={newPlayer.phone} onChange={e=>setNewPlayer({...newPlayer,phone:e.target.value})} />
          <Input label="EMAIL" placeholder="john@email.com" value={newPlayer.email} onChange={e=>setNewPlayer({...newPlayer,email:e.target.value})} />
          <div style={{ fontSize:11,color:C.dim,marginBottom:12 }}>Player will receive an invite via email/push to claim their squares.</div>
          <Btn primary onClick={addNewPlayer} disabled={!newPlayer.name} style={{ width:"100%" }}>Add Player</Btn>
        </Modal>
      )}

      {modal==="bulkAdd" && (
        <Modal title="Bulk Add Players" onClose={()=>setModal(null)} wide>
          <div style={{ fontSize:12,color:C.muted,marginBottom:12 }}>Paste a list of players — one per line. Format: <code style={{ color:C.green }}>Name, Phone, Email</code></div>
          <textarea placeholder={"John Smith, (555) 123-4567, john@email.com\nJane Doe, (555) 234-5678, jane@email.com\nBob Wilson, , bob@email.com"}
            style={{ width:"100%",minHeight:120,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:12,color:C.text,fontSize:12,fontFamily:F,outline:"none",boxSizing:"border-box",resize:"vertical" }} />
          <Btn primary style={{ width:"100%",marginTop:12 }}>Import Players</Btn>
        </Modal>
      )}

      {modal==="managePlayer" && modalData && (
        <Modal title={`Manage: ${modalData.name}`} onClose={()=>setModal(null)}>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            <div style={{ background:C.bg,borderRadius:8,padding:12,display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:12,color:C.muted }}>Squares</span>
              <span style={{ fontSize:13,fontWeight:700,fontFamily:F,color:modalData.color }}>{playerCounts[modalData.id]||0}</span>
            </div>
            <div style={{ background:C.bg,borderRadius:8,padding:12,display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:12,color:C.muted }}>Buy-in</span>
              <span style={{ fontSize:13,fontWeight:700,fontFamily:F }}>${(playerCounts[modalData.id]||0)*denom}</span>
            </div>
            <div style={{ background:C.bg,borderRadius:8,padding:12,display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontSize:12,color:C.muted }}>Payment</span>
              <Badge color={modalData.paid?C.green:C.pending}>{modalData.paid?"CONFIRMED":"PENDING"}</Badge>
            </div>
            <Btn onClick={()=>togglePayment(modalData.id)} style={{ width:"100%" }}>{modalData.paid?"Mark Unpaid":"✅ Confirm Payment"}</Btn>
            <Btn danger onClick={()=>markDeadbeat(modalData.id)} style={{ width:"100%" }}>🚫 Mark Deadbeat & Release Squares</Btn>
            <div style={{ fontSize:10,color:C.dim,textAlign:"center" }}>Marking as deadbeat releases all their squares and bans them from this pool.</div>
          </div>
        </Modal>
      )}

      {modal==="manageSquare" && modalData && (
        <Modal title={`Square (${modalData.r}, ${modalData.c})`} onClose={()=>{setModal(null);setSelCell(null);}}>
          {modalData.player ? (
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              <div style={{ background:C.bg,borderRadius:8,padding:14,display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ width:36,height:36,borderRadius:"50%",background:`${modalData.player.color}20`,color:modalData.player.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13 }}>{modalData.player.name[0]}</div>
                <div>
                  <div style={{ fontSize:14,fontWeight:700 }}>{modalData.player.name}</div>
                  <Badge color={modalData.player.squareStatus==="confirmed"?C.green:C.pending}>{modalData.player.squareStatus==="confirmed"?"PAID":"UNPAID"}</Badge>
                </div>
              </div>
              {isLocked && <div style={{ background:`${C.gold}10`,border:`1px solid ${C.gold}30`,borderRadius:8,padding:10,fontSize:11,color:C.gold }}>⚠ Board is locked. Admin override required to change this square.</div>}
              <Btn danger onClick={()=>{removeFromSquare(modalData.r,modalData.c);setModal(null);}} style={{ width:"100%" }}>
                {isLocked?"🔓 Override: Release Square":"Release Square"}
              </Btn>
              <div style={{ fontSize:10,color:C.dim,textAlign:"center" }}>Releasing makes this square available for another player{isLocked?" (digits stay locked)":""}.</div>
            </div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
              <div style={{ fontSize:13,color:C.muted,marginBottom:4 }}>This square is open. Assign to a player:</div>
              {players.filter(p=>!p.banned).map(p=>(
                <div key={p.id} onClick={()=>{assignSquare(modalData.r,modalData.c,p);setModal(null);}}
                  style={{ background:C.bg,borderRadius:8,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,border:`1px solid ${C.border}` }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=p.color} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{ width:24,height:24,borderRadius:"50%",background:`${p.color}20`,color:p.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800 }}>{p.name[0]}</div>
                  <span style={{ fontSize:12,fontWeight:700 }}>{p.name}</span>
                  <span style={{ fontSize:10,color:C.dim,marginLeft:"auto" }}>{playerCounts[p.id]||0} sq</span>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:S }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
      {view==="pools" && renderPools()}
      {view==="create" && renderCreate()}
      {view==="pool-detail" && renderPoolDetail()}
    </div>
  );
}