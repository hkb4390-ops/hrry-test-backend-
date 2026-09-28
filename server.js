const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment Variables with Defaults
const BACKEND_URL = process.env.BACKEND_URL || 'https://hrry-test-backend.onrender.com';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://hrrr-test-free.vercel.app';
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://hyuuu-732f9-default-rtdb.firebaseio.com';
const SHRINKME_API_KEY = process.env.SHRINKME_API_KEY || 'YOUR_SHRINKME_API_KEY';

// CORS Configuration (Allows requests from Vercel Frontend)
app.use(cors({
    origin: '*', // For production testing, allows requests from Vercel domain
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Helper function to generate unique key
function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'FREE-';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Health Check Route
app.get('/', (req, res) => {
    res.send('Key Verification Server is running normally.');
});

// 1. START FREE KEY GENERATION
app.post('/api/free/start', async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) {
            return res.status(400).json({ ok: false, error: 'Device ID missing' });
        }

        const generatedKey = generateRandomKey();
        const returnUrl = `${WEBSITE_URL}?key=${generatedKey}`;

        // Save Key details to Firebase Realtime Database
        const keyData = {
            deviceId: deviceId,
            status: 'pending',
            createdAt: Date.now()
        };

        const fbResponse = await fetch(`${FIREBASE_DB_URL}/keys/${generatedKey}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(keyData)
        });

        if (!fbResponse.ok) {
            throw new Error('Failed to save key in Firebase DB');
        }

        // Generate ShrinkMe Link
        let redirectUrl = returnUrl;
        if (SHRINKME_API_KEY && SHRINKME_API_KEY !== 'YOUR_SHRINKME_API_KEY') {
            const shrinkRes = await fetch(`https://shrinkme.io/api?api=${SHRINKME_API_KEY}&url=${encodeURIComponent(returnUrl)}`);
            const shrinkData = await shrinkRes.json();
            if (shrinkData.status === 'success') {
                redirectUrl = shrinkData.shorturl;
            }
        }

        console.log(`[START] Key Generated: ${generatedKey} for Device: ${deviceId}`);
        return res.json({ ok: true, shrinkmeUrl: redirectUrl, key: generatedKey });

    } catch (err) {
        console.error('[START ERROR]', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// 2. VERIFY / REDEEM FREE KEY
app.post('/api/free/redeem', async (req, res) => {
    try {
        const { key, deviceId } = req.body;

        if (!key || !deviceId) {
            return res.status(400).json({ ok: false, error: 'Key and Device ID are required' });
        }

        // Fetch Key info from Firebase Realtime DB
        const fbResponse = await fetch(`${FIREBASE_DB_URL}/keys/${key}.json`);
        const keyData = await fbResponse.json();

        if (!keyData) {
            return res.status(404).json({ ok: false, error: 'Invalid or non-existent Key' });
        }

        if (keyData.deviceId !== deviceId) {
            return res.status(403).json({ ok: false, error: 'This Key was generated for another device' });
        }

        // Activate Key status in Firebase
        await fetch(`${FIREBASE_DB_URL}/keys/${key}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'active',
                activatedAt: Date.now()
            })
        });

        console.log(`[REDEEM SUCCESS] Key Activated: ${key} for Device: ${deviceId}`);
        return res.json({ ok: true, message: 'Key verified and activated successfully!' });

    } catch (err) {
        console.error('[REDEEM ERROR]', err);
        return res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
