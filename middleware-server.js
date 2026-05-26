const express = require("express");
const app = express();
app.use(express.json());

const PORT           = process.env.PORT           || 3000;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || "";
const WEBHOOK_TOKEN  = process.env.WEBHOOK_TOKEN  || "";

let donationQueue = [];
let allDonations  = {};

function parseRobloxUsername(message) {
    if (!message) return null;
    const match = message.match(/roblox\s*:\s*([A-Za-z0-9_]+)/i);
    return match ? match[1].trim() : null;
}

// ── Endpoint 1: Webhook dari SociaBuzz ──────────────────────
app.post("/webhook/sosialbuzz", (req, res) => {
    // Verifikasi token SociaBuzz (dikirim di header atau body)
    const tokenHeader = req.headers["x-webhook-token"] || req.headers["authorization"] || "";
    const tokenBody   = req.body.token || "";
    if (WEBHOOK_TOKEN && tokenHeader !== WEBHOOK_TOKEN && tokenBody !== WEBHOOK_TOKEN) {
        // Log saja tapi tetap terima — SociaBuzz kadang tidak kirim token di header
        console.warn("[Webhook] Token tidak cocok, tetap diproses.");
    }

    console.log("[Webhook] Payload:", JSON.stringify(req.body));

    const { name, amount, message } = req.body;
    // Jadi ini:
if (!name || !amount) {
    return res.status(200).json({ status: "ok (test ping)" });
}
    const robloxUsername = parseRobloxUsername(message) || null;
    const donasi = {
        donor_name      : String(name),
        roblox_username : robloxUsername,
        amount          : Number(amount),
        message         : String(message || ""),
        timestamp       : new Date().toISOString(),
    };

    donationQueue.push(donasi);

    const key = (robloxUsername || name).toLowerCase();
    if (!allDonations[key]) {
        allDonations[key] = { display_name: name, roblox_username: robloxUsername, total: 0 };
    }
    if (robloxUsername && !allDonations[key].roblox_username) {
        allDonations[key].roblox_username = robloxUsername;
    }
    allDonations[key].total += donasi.amount;

    console.log(`[Webhook] ✅ ${name} (Roblox: ${robloxUsername || "-"}) → Rp${Number(amount).toLocaleString("id-ID")}`);
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
            roblox_username : e.roblox_username || null,
            total           : e.total,
        }));
    return res.status(200).json({ leaderboard: sorted, count: sorted.length });
});

// ── Endpoint 4: Health check ─────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({
        status           : "ok",
        queue_pending    : donationQueue.length,
        total_donors     : Object.keys(allDonations).length,
        leaderboard_preview: Object.values(allDonations)
            .sort((a,b) => b.total - a.total).slice(0, 5)
            .map((e,i) => `${i+1}. ${e.display_name} - Rp${e.total.toLocaleString("id-ID")}`),
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server jalan di port ${PORT}`);
    console.log(`   POST /webhook/sosialbuzz`);
    console.log(`   GET  /roblox/poll`);
    console.log(`   GET  /roblox/leaderboard`);
    console.log(`   GET  /health\n`);
});
