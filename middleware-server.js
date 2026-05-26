// ============================================================
//  SosialBuzz Leaderboard — Middleware Server (Node.js)
//  Format payload SociaBuzz asli: { name, amount, message }
//  Deploy ke Railway: railway.app (gratis)
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());

const PORT           = process.env.PORT           || 3000;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || "GANTI_APIKEY_ROBLOX";

// ── Penyimpanan ──────────────────────────────────────────────
let donationQueue = [];                   // antrian belum diambil Roblox
let allDonations  = {};                   // { key: { display_name, roblox_username, total } }

// ── Helper: parse username Roblox dari pesan ─────────────────
// Donatur bisa tulis: "roblox:NamaRoblox pesan lainnya"
// atau                "roblox: NamaRoblox | pesan lainnya"
function parseRobloxUsername(message) {
    if (!message) return null;
    const match = message.match(/roblox\s*:\s*([A-Za-z0-9_]+)/i);
    return match ? match[1].trim() : null;
}

// ── Helper: validasi API key Roblox ─────────────────────────
function validateRobloxKey(req) {
    return req.headers["x-roblox-key"] === ROBLOX_API_KEY;
}

// ============================================================
//  ENDPOINT 1: Terima webhook dari SociaBuzz
//  POST /webhook/sosialbuzz
//  (tidak perlu secret — SociaBuzz kirim langsung)
//
//  Payload SociaBuzz asli:
//  { "name": "...", "amount": 50000, "message": "..." }
//
//  Agar foto Roblox muncul, donatur tulis di pesan:
//  "roblox:UsernameKamu pesan bebas di sini"
// ============================================================
app.post("/webhook/sosialbuzz", (req, res) => {
    console.log("[Webhook] Payload masuk:", JSON.stringify(req.body));

    const { name, amount, message } = req.body;

    if (!name || !amount) {
        return res.status(400).json({ error: "Missing name or amount" });
    }

    // Coba extract username Roblox dari pesan
    const robloxUsername = parseRobloxUsername(message) || null;

    const donasi = {
        donor_name      : String(name),
        roblox_username : robloxUsername,          // null jika tidak ada
        amount          : Number(amount),
        message         : String(message || ""),
        timestamp       : new Date().toISOString(),
    };

    donationQueue.push(donasi);

    // Key leaderboard: pakai roblox_username jika ada, fallback ke nama donatur (lowercase)
    const key = (robloxUsername || name).toLowerCase();
    if (!allDonations[key]) {
        allDonations[key] = {
            display_name    : name,
            roblox_username : robloxUsername,
            total           : 0,
        };
    }
    // Update roblox_username jika sebelumnya null
    if (robloxUsername && !allDonations[key].roblox_username) {
        allDonations[key].roblox_username = robloxUsername;
    }
    allDonations[key].total += donasi.amount;

    console.log(`[Webhook] ✅ ${name} (Roblox: ${robloxUsername || "-"}) → Rp${Number(amount).toLocaleString("id-ID")}`);
    return res.status(200).json({ status: "ok", queued: donationQueue.length });
});


// ============================================================
//  ENDPOINT 2: Roblox polling — ambil donasi baru (consume once)
//  GET /roblox/poll
//  Header: x-roblox-key
// ============================================================
app.get("/roblox/poll", (req, res) => {
    if (!validateRobloxKey(req)) return res.status(401).json({ error: "Unauthorized" });

    const batch    = [...donationQueue];
    donationQueue  = [];
    console.log(`[Poll] Roblox mengambil ${batch.length} donasi baru.`);
    return res.status(200).json({ donations: batch, count: batch.length });
});


// ============================================================
//  ENDPOINT 3: Roblox ambil leaderboard total
//  GET /roblox/leaderboard?top=10
//  Header: x-roblox-key
// ============================================================
app.get("/roblox/leaderboard", (req, res) => {
    if (!validateRobloxKey(req)) return res.status(401).json({ error: "Unauthorized" });

    const top    = Math.min(parseInt(req.query.top) || 10, 100);
    const sorted = Object.values(allDonations)
        .sort((a, b) => b.total - a.total)
        .slice(0, top)
        .map((e, i) => ({
            rank            : i + 1,
            display_name    : e.display_name,
            roblox_username : e.roblox_username || null,
            total           : e.total,
        }));

    return res.status(200).json({ leaderboard: sorted, count: sorted.length });
});


// ============================================================
//  ENDPOINT 4: Test webhook manual (untuk debug)
//  POST /test
//  Body: { "name": "...", "amount": 50000, "message": "roblox:Username123 halo!" }
// ============================================================
app.post("/test", (req, res) => {
    // Teruskan ke handler webhook
    req.url = "/webhook/sosialbuzz";
    app._router.handle(req, res, () => {});
    // Cara lebih simpel: forward manual
    const { name, amount, message } = req.body;
    if (!name || !amount) return res.status(400).json({ error: "Missing name or amount" });

    const robloxUsername = parseRobloxUsername(message) || null;
    const donasi = {
        donor_name: String(name), roblox_username: robloxUsername,
        amount: Number(amount), message: String(message || ""),
        timestamp: new Date().toISOString(),
    };
    donationQueue.push(donasi);
    const key = (robloxUsername || name).toLowerCase();
    if (!allDonations[key]) allDonations[key] = { display_name: name, roblox_username: robloxUsername, total: 0 };
    allDonations[key].total += donasi.amount;
    console.log(`[Test] ✅ Test donasi: ${name} → Rp${Number(amount).toLocaleString("id-ID")}`);
    return res.status(200).json({ status: "ok (test)", donasi });
});


// ============================================================
//  ENDPOINT 5: Health check
// ============================================================
app.get("/health", (_req, res) => {
    res.json({
        status        : "ok",
        queue_pending : donationQueue.length,
        total_donors  : Object.keys(allDonations).length,
        leaderboard_preview: Object.values(allDonations)
            .sort((a,b) => b.total - a.total).slice(0, 5)
            .map((e,i) => `${i+1}. ${e.display_name} - Rp${e.total.toLocaleString("id-ID")}`),
    });
});


app.listen(PORT, () => {
    console.log(`\n🚀 SociaBuzz Middleware Server jalan di port ${PORT}`);
    console.log(`   POST /webhook/sosialbuzz  ← dari SociaBuzz`);
    console.log(`   GET  /roblox/poll         ← Roblox ambil donasi baru`);
    console.log(`   GET  /roblox/leaderboard  ← Roblox ambil top donatur`);
    console.log(`   POST /test                ← test manual`);
    console.log(`   GET  /health              ← cek status\n`);
});
