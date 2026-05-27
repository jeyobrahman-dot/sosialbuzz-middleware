// ============================================================
//  SosialBuzz Leaderboard — Middleware Server (Node.js)
//  Field "supporter" dari SociaBuzz dipakai sebagai username
//  Dengan penyimpanan permanen ke file JSON
// ============================================================

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const app     = express();
app.use(express.json());

const PORT           = process.env.PORT           || 3000;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || "";
const DATA_FILE      = path.join("/tmp", "donations.json");

// ── Load data dari file saat server start ────────────────────
let donationQueue = [];
let allDonations  = {};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw  = fs.readFileSync(DATA_FILE, "utf8");
            const data = JSON.parse(raw);
            allDonations = data.allDonations || {};
            console.log(`[Load] Data loaded: ${Object.keys(allDonations).length} donors`);
        }
    } catch (e) {
        console.error("[Load] Gagal load data:", e.message);
        allDonations = {};
    }
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ allDonations }, null, 2));
    } catch (e) {
        console.error("[Save] Gagal simpan data:", e.message);
    }
}

loadData();

// ── Endpoint 1: Webhook dari SociaBuzz ──────────────────────
// Field asli SociaBuzz: supporter, amount, message
app.post("/webhook/sosialbuzz", (req, res) => {
    console.log("[Webhook] Payload Masuk:", JSON.stringify(req.body));

    const supporter = req.body.supporter;
    const amount    = req.body.amount;
    const message   = req.body.message || "";

    // Test ping atau payload kosong
    if (!supporter || !amount) {
        console.log("[Webhook] Test Ping Terdeteksi.");
        return res.status(200).json({ status: "ok (test ping)" });
    }

    const donasi = {
        donor_name      : String(supporter),
        roblox_username : String(supporter),  // nama supporter = username Roblox
        amount          : Number(amount),
        message         : String(message),
        timestamp       : new Date().toISOString(),
    };

    donationQueue.push(donasi);

    const key = String(supporter).toLowerCase();
    if (!allDonations[key]) {
        allDonations[key] = {
            display_name    : String(supporter),
            roblox_username : String(supporter),
            total           : 0,
        };
    }
    allDonations[key].total += donasi.amount;

    saveData();

    console.log(`[Webhook] ✅ ${supporter} → Rp${Number(amount).toLocaleString("id-ID")}`);
    return res.status(200).json({ status: "ok", queued: donationQueue.length });
});

// ── Endpoint 2: Roblox poll donasi baru ─────────────────────
app.get("/roblox/poll", (req, res) => {
    if (req.headers["x-roblox-key"] !== ROBLOX_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const batch   = [...donationQueue];
    donationQueue = [];
    console.log(`[Poll] ${batch.length} donasi diambil Roblox.`);
    return res.status(200).json({ donations: batch, count: batch.length });
});

// ── Endpoint 3: Leaderboard ──────────────────────────────────
app.get("/roblox/leaderboard", (req, res) => {
    if (req.headers["x-roblox-key"] !== ROBLOX_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const top    = Math.min(parseInt(req.query.top) || 10, 100);
    const sorted = Object.values(allDonations)
        .sort((a, b) => b.total - a.total)
        .slice(0, top)
        .map((e, i) => ({
            rank            : i + 1,
            display_name    : e.display_name,
            roblox_username : e.roblox_username,
            total           : e.total,
        }));
    return res.status(200).json({ leaderboard: sorted, count: sorted.length });
});

// ── Endpoint 4: Reset data (admin only) ──────────────────────
app.post("/admin/reset", (req, res) => {
    if (req.headers["x-roblox-key"] !== ROBLOX_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    allDonations  = {};
    donationQueue = [];
    saveData();
    console.log("[Admin] Data direset!");
    return res.status(200).json({ status: "reset ok" });
});

// ── Endpoint 5: Health check ─────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({
        status              : "ok",
        queue_pending       : donationQueue.length,
        total_donors        : Object.keys(allDonations).length,
        leaderboard_preview : Object.values(allDonations)
            .sort((a, b) => b.total - a.total).slice(0, 5)
            .map((e, i) => `${i+1}. ${e.display_name} - Rp${e.total.toLocaleString("id-ID")}`),
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server jalan di port ${PORT}`);
    console.log(`   POST /webhook/sosialbuzz`);
    console.log(`   GET  /roblox/poll`);
    console.log(`   GET  /roblox/leaderboard`);
    console.log(`   POST /admin/reset`);
    console.log(`   GET  /health\n`);
});
