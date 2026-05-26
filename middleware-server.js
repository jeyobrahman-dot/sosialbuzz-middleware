// ============================================================
//  SosialBuzz Leaderboard — Middleware Server (Node.js)
//  Username Roblox diambil langsung dari field "name" SociaBuzz
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || "zeroo26secret123";

let donationQueue = [];
let allDonations = {};

// ── Endpoint 1: Webhook dari SociaBuzz ──────────────────────
app.post("/webhook/sosialbuzz", (req, res) => {
    console.log("[Webhook] Payload Masuk:", JSON.stringify(req.body));

    // Ambil data langsung dari root (PowerShell) atau dari object data (SosialBuzz Asli)
    const bodyData = req.body.data ? req.body.data : req.body;

    const name = bodyData.name;
    const amount = bodyData.amount;
    const message = bodyData.message || "";

    // Jika ini hanya test ping kosong dari SosialBuzz atau tidak ada data valid
    if (!name || !amount) {
        console.log("[Webhook] Test Ping Terdeteksi.");
        return res.status(200).json({ status: "ok (test ping)" });
    }

    const cleanUsername = String(name).trim();
    const cleanAmount = Number(amount);

    // Bikin struktur objek antrean donasi
    const donasi = {
        donor_name: cleanUsername,
        roblox_username: cleanUsername, // Ambil nama langsung sebagai Roblox Username
        amount: cleanAmount,
        message: String(message),
        timestamp: new Date().toISOString(),
    };

    // Masukkan ke antrean polling Roblox
    donationQueue.push(donasi);

    // Masukkan/Update total akumulasi ke data leaderboard lokal memory
    const key = cleanUsername.toLowerCase();
    if (!allDonations[key]) {
        allDonations[key] = {
            display_name: cleanUsername,
            roblox_username: cleanUsername,
            total: 0
        };
    }
    allDonations[key].total += cleanAmount;

    console.log(`[Webhook] ✅ Berhasil memproses donasi: ${cleanUsername} → Rp${cleanAmount.toLocaleString("id-ID")}`);
    return res.status(200).json({ status: "ok", queued: donationQueue.length });
});

// ── Endpoint 2: Poll Donasi Baru untuk Roblox ────────────────
app.get("/roblox/poll", (req, res) => {
    const apiKey = req.headers["x-roblox-key"];
    if (apiKey !== ROBLOX_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // Ambil semua donasi di antrean, lalu kosongkan antrean
    const currentDonations = [...donationQueue];
    donationQueue = [];

    return res.status(200).json({ donations: currentDonations });
});

// ── Endpoint 3: Ambil Data Leaderboard ───────────────────────
app.get("/roblox/leaderboard", (req, res) => {
    const sorted = Object.values(allDonations)
        .sort((a, b) => b.total - a.total)
        .map((e, i) => ({
            rank: i + 1,
            display_name: e.display_name,
            roblox_username: e.roblox_username,
            total: e.total,
        }));
    return res.status(200).json({ leaderboard: sorted, count: sorted.length });
});

// ── Endpoint 4: Health Check Server ──────────────────────────
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        queue_pending: donationQueue.length,
        total_donors: Object.keys(allDonations).length,
        leaderboard_preview: Object.values(allDonations)
            .sort((a, b) => b.total - a.total).slice(0, 5)
            .map((e, i) => `${i + 1}. ${e.display_name} - Rp${e.total.toLocaleString("id-ID")}`),
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server jalan di port ${PORT}`);
});
