// ============================================================
// HRRY TEST - FREE KEY BACKEND
// Express + Firebase Realtime Database + ShrinkMe
// ============================================================

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

const app = express();

app.use(express.json({ limit: "1mb" }));

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================

const PORT = process.env.PORT || 10000;

const BACKEND_URL = (
    process.env.BACKEND_URL ||
    "https://hrry-test-backend.onrender.com"
).replace(/\/+$/, "");

const WEBSITE_URL = (
    process.env.WEBSITE_URL ||
    "https://hrrr-test-free.vercel.app"
).replace(/\/+$/, "");

const FIREBASE_DB_URL = (
    process.env.FIREBASE_DB_URL ||
    "https://hyuuu-732f9-default-rtdb.firebaseio.com"
).replace(/\/+$/, "");

const SHRINKME_API_KEY = process.env.SHRINKME_API_KEY || "";

const FIREBASE_SERVICE_ACCOUNT =
    process.env.FIREBASE_SERVICE_ACCOUNT || "";

// ============================================================
// CORS
// ============================================================

const allowedOrigins = new Set([
    "https://hrrr-test-free.vercel.app",
    "https://www.hrrr-test-free.vercel.app"
]);

function isAllowedOrigin(origin) {
    if (!origin) return true;

    if (allowedOrigins.has(origin)) {
        return true;
    }

    // Allow Vercel preview deployments
    try {
        const url = new URL(origin);

        if (
            url.protocol === "https:" &&
            url.hostname.endsWith(".vercel.app")
        ) {
            return true;
        }
    } catch (_) {}

    // Local development
    if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
    ) {
        return true;
    }

    return false;
}

app.use(
    cors({
        origin: function (origin, callback) {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
            } else {
                callback(new Error("CORS blocked"));
            }
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: false,
        maxAge: 86400
    })
);

// ============================================================
// FIREBASE INITIALIZATION
// ============================================================

let db = null;
let firebaseReady = false;
let firebaseInitError = null;

function initializeFirebase() {
    try {
        if (!FIREBASE_SERVICE_ACCOUNT) {
            throw new Error(
                "FIREBASE_SERVICE_ACCOUNT environment variable is missing."
            );
        }

        let serviceAccount;

        try {
            serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
        } catch (error) {
            throw new Error(
                "FIREBASE_SERVICE_ACCOUNT contains invalid JSON."
            );
        }

        if (!serviceAccount.project_id) {
            throw new Error(
                "Firebase service account is missing project_id."
            );
        }

        if (!serviceAccount.private_key) {
            throw new Error(
                "Firebase service account is missing private_key."
            );
        }

        if (!serviceAccount.client_email) {
            throw new Error(
                "Firebase service account is missing client_email."
            );
        }

        // Fix escaped newlines if required
        serviceAccount.private_key =
            serviceAccount.private_key.replace(/\\n/g, "\n");

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: FIREBASE_DB_URL
            });
        }

        db = admin.database();
        firebaseReady = true;
        firebaseInitError = null;

        console.log("✅ Firebase Admin initialized successfully.");
        console.log(
            "✅ Firebase project:",
            serviceAccount.project_id
        );
        console.log(
            "✅ Firebase database:",
            FIREBASE_DB_URL
        );

    } catch (error) {
        firebaseReady = false;
        db = null;
        firebaseInitError = error;

        console.error(
            "❌ Firebase initialization failed:"
        );
        console.error(error.message);
    }
}

initializeFirebase();

// ============================================================
// HELPERS
// ============================================================

function ensureDatabase() {
    if (!firebaseReady || !db) {
        throw new Error(
            "Firebase database is not initialized."
        );
    }

    return db;
}

function cleanString(value, maxLength = 500) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, maxLength);
}

function createRandomHex(bytes = 16) {
    return crypto.randomBytes(bytes).toString("hex");
}

function createRequestId() {
    return createRandomHex(16);
}

function createSecretToken() {
    return createRandomHex(32);
}

function createFreeKey() {
    return (
        "HRRY-FREE-" +
        crypto.randomBytes(8).toString("hex").toUpperCase()
    );
}

function hashDeviceId(deviceId) {
    return crypto
        .createHash("sha256")
        .update(String(deviceId))
        .digest("hex");
}

function getNow() {
    return Date.now();
}

function getExpiry(hours = 12) {
    return getNow() + hours * 60 * 60 * 1000;
}

function isExpired(expiresAt) {
    return !expiresAt || getNow() >= Number(expiresAt);
}

// ============================================================
// HEALTH
// ============================================================

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "HRRY Test Free Key Backend",
        firebase: firebaseReady,
        time: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    res.status(200).json({
        ok: true,
        firebase: firebaseReady,
        firebaseError: firebaseReady
            ? null
            : firebaseInitError?.message || "Unknown Firebase error",
        time: new Date().toISOString()
    });
});

// ============================================================
// START FREE KEY
// ============================================================

app.post("/api/free/start", async (req, res) => {
    try {
        const database = ensureDatabase();

        if (!SHRINKME_API_KEY) {
            return res.status(500).json({
                ok: false,
                error: "SHRINKME_API_KEY is not configured on the server."
            });
        }

        const deviceId = cleanString(req.body?.deviceId, 300);

        if (!deviceId) {
            return res.status(400).json({
                ok: false,
                error: "Device ID is required."
            });
        }

        const requestId = createRequestId();
        const secretToken = createSecretToken();
        const key = createFreeKey();

        const createdAt = getNow();
        const expiresAt = getExpiry(12);

        const deviceIdHash = hashDeviceId(deviceId);

        const destinationUrl =
            `${BACKEND_URL}/free/${requestId}/${secretToken}`;

        const record = {
            key,
            type: "free",
            durationHours: 12,

            requestId,
            secretToken,

            deviceIdHash,

            createdAt,
            expiresAt,

            used: false,
            usedAt: null,

            status: "created",

            shrinkmeUrl: null,
            destinationUrl
        };

        // ----------------------------------------------------
        // Save request
        // ----------------------------------------------------

        await database
            .ref(`hrry_free_keys/${requestId}`)
            .set(record);

        // ----------------------------------------------------
        // Key index
        // ----------------------------------------------------

        await database
            .ref(`hrry_free_key_index/${key}`)
            .set(requestId);

        // ----------------------------------------------------
        // Device index
        // ----------------------------------------------------

        await database
            .ref(`hrry_free_device_index/${deviceIdHash}`)
            .set(requestId);

        // ----------------------------------------------------
        // ShrinkMe API
        // ----------------------------------------------------

        const shrinkmeApiUrl =
            "https://shrinkme.io/api" +
            "?api=" +
            encodeURIComponent(SHRINKME_API_KEY) +
            "&url=" +
            encodeURIComponent(destinationUrl);

        console.log(
            "Creating ShrinkMe URL for request:",
            requestId
        );

        const shrinkResponse = await fetch(
            shrinkmeApiUrl,
            {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        const shrinkText = await shrinkResponse.text();

        let shrinkData;

        try {
            shrinkData = JSON.parse(shrinkText);
        } catch (_) {
            shrinkData = null;
        }

        console.log(
            "ShrinkMe HTTP status:",
            shrinkResponse.status
        );

        if (!shrinkResponse.ok) {
            await database
                .ref(`hrry_free_keys/${requestId}/status`)
                .set("shrinkme_error");

            return res.status(502).json({
                ok: false,
                error:
                    "ShrinkMe API request failed.",
                status: shrinkResponse.status
            });
        }

        if (
            !shrinkData ||
            shrinkData.status !== "success" ||
            !shrinkData.shortenedUrl
        ) {
            console.error(
                "ShrinkMe invalid response:",
                shrinkText.slice(0, 1000)
            );

            await database
                .ref(`hrry_free_keys/${requestId}/status`)
                .set("shrinkme_error");

            return res.status(502).json({
                ok: false,
                error:
                    "ShrinkMe did not return a shortened URL."
            });
        }

        const shrinkmeUrl = String(
            shrinkData.shortenedUrl
        );

        // ----------------------------------------------------
        // Update record
        // ----------------------------------------------------

        await database
            .ref(`hrry_free_keys/${requestId}`)
            .update({
                shrinkmeUrl,
                status: "ready"
            });

        console.log(
            "✅ Free key created:",
            requestId
        );

        return res.json({
            ok: true,
            requestId,
            shrinkmeUrl,
            expiresAt,
            durationHours: 12
        });

    } catch (error) {
        console.error(
            "❌ /api/free/start:",
            error
        );

        return res.status(500).json({
            ok: false,
            error:
                error.message ||
                "Free key server error."
        });
    }
});

// ============================================================
// FREE KEY LANDING PAGE
// ShrinkMe redirects here
// ============================================================

app.get(
    "/free/:requestId/:secretToken",
    async (req, res) => {
        try {
            const database = ensureDatabase();

            const requestId =
                cleanString(req.params.requestId, 100);

            const secretToken =
                cleanString(req.params.secretToken, 200);

            if (!requestId || !secretToken) {
                return res.status(400).send(
                    "Invalid Free Key link."
                );
            }

            const snapshot = await database
                .ref(`hrry_free_keys/${requestId}`)
                .once("value");

            const record = snapshot.val();

            if (!record) {
                return res.status(404).send(
                    createHtmlPage(
                        "Invalid Free Key",
                        "यह Free Key link valid नहीं है।"
                    )
                );
            }

            if (record.secretToken !== secretToken) {
                return res.status(403).send(
                    createHtmlPage(
                        "Invalid Link",
                        "यह link valid नहीं है।"
                    )
                );
            }

            if (record.used === true) {
                return res.status(410).send(
                    createHtmlPage(
                        "Key Already Redeemed",
                        "यह Free Key पहले ही redeem हो चुकी है।"
                    )
                );
            }

            if (isExpired(record.expiresAt)) {
                return res.status(410).send(
                    createHtmlPage(
                        "Key Expired",
                        "यह Free Key expire हो चुकी है।"
                    )
                );
            }

            return res.send(
                createFreeKeyPage({
                    key: record.key,
                    expiresAt: record.expiresAt,
                    websiteUrl: WEBSITE_URL
                })
            );

        } catch (error) {
            console.error(
                "❌ /free/:requestId/:secretToken:",
                error
            );

            return res.status(500).send(
                createHtmlPage(
                    "Server Error",
                    "Free Key server में समस्या हुई।"
                )
            );
        }
    }
);

// ============================================================
// REDEEM FREE KEY
// ============================================================

app.post("/api/free/redeem", async (req, res) => {
    try {
        const database = ensureDatabase();

        const key =
            cleanString(req.body?.key, 100)
                .toUpperCase();

        const deviceId =
            cleanString(req.body?.deviceId, 300);

        if (!key) {
            return res.status(400).json({
                ok: false,
                error: "Key is required."
            });
        }

        if (!deviceId) {
            return res.status(400).json({
                ok: false,
                error: "Device ID is required."
            });
        }

        if (!key.startsWith("HRRY-FREE-")) {
            return res.status(400).json({
                ok: false,
                error: "यह Free Key नहीं है।"
            });
        }

        const keyIndexSnapshot = await database
            .ref(`hrry_free_key_index/${key}`)
            .once("value");

        const requestId =
            keyIndexSnapshot.val();

        if (!requestId) {
            return res.status(404).json({
                ok: false,
                error: "Free Key invalid है।"
            });
        }

        const keyRef =
            database.ref(
                `hrry_free_keys/${requestId}`
            );

        const deviceIdHash =
            hashDeviceId(deviceId);

        let transactionResult;

        transactionResult = await keyRef.transaction(
            (current) => {
                if (!current) {
                    return;
                }

                // Already redeemed
                if (current.used === true) {
                    return;
                }

                // Expired
                if (
                    !current.expiresAt ||
                    getNow() >= Number(current.expiresAt)
                ) {
                    return;
                }

                // Only original requesting device
                if (
                    current.deviceIdHash !==
                    deviceIdHash
                ) {
                    return;
                }

                current.used = true;
                current.usedAt = getNow();
                current.status = "active";

                return current;
            }
        );

        const committed =
            transactionResult.committed;

        const updatedRecord =
            transactionResult.snapshot.val();

        if (!committed || !updatedRecord) {
            return res.status(409).json({
                ok: false,
                error:
                    "Free Key already used, expired, or this device is not allowed."
            });
        }

        return res.json({
            ok: true,
            key: updatedRecord.key,
            expiresAt: Number(
                updatedRecord.expiresAt
            ),
            durationHours: 12,
            status: "active"
        });

    } catch (error) {
        console.error(
            "❌ /api/free/redeem:",
            error
        );

        return res.status(500).json({
            ok: false,
            error:
                error.message ||
                "Free Key redeem failed."
        });
    }
});

// ============================================================
// CHECK FREE ACCESS
// IMPORTANT:
// used=true means "already redeemed",
// NOT "access expired".
// Access remains active until expiresAt.
// ============================================================

app.post("/api/free/status", async (req, res) => {
    try {
        const database = ensureDatabase();

        const deviceId =
            cleanString(req.body?.deviceId, 300);

        if (!deviceId) {
            return res.status(400).json({
                ok: false,
                error: "Device ID is required."
            });
        }

        const deviceIdHash =
            hashDeviceId(deviceId);

        const indexSnapshot = await database
            .ref(
                `hrry_free_device_index/${deviceIdHash}`
            )
            .once("value");

        const requestId =
            indexSnapshot.val();

        if (!requestId) {
            return res.json({
                ok: true,
                active: false
            });
        }

        const recordSnapshot = await database
            .ref(`hrry_free_keys/${requestId}`)
            .once("value");

        const record = recordSnapshot.val();

        if (!record) {
            return res.json({
                ok: true,
                active: false
            });
        }

        // Verify device
        if (
            record.deviceIdHash !==
            deviceIdHash
        ) {
            return res.json({
                ok: true,
                active: false
            });
        }

        // Must be redeemed
        if (record.used !== true) {
            return res.json({
                ok: true,
                active: false
            });
        }

        // Expiration check
        if (isExpired(record.expiresAt)) {
            await database
                .ref(`hrry_free_keys/${requestId}/status`)
                .set("expired");

            return res.json({
                ok: true,
                active: false,
                expired: true
            });
        }

        // ACTIVE
        return res.json({
            ok: true,
            active: true,
            key: record.key,
            expiresAt: Number(
                record.expiresAt
            ),
            durationHours: 12
        });

    } catch (error) {
        console.error(
            "❌ /api/free/status:",
            error
        );

        return res.status(500).json({
            ok: false,
            error:
                error.message ||
                "Free access status failed."
        });
    }
});

// ============================================================
// SIMPLE HTML HELPERS
// ============================================================

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function createHtmlPage(title, message) {
    return `
<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<meta name="viewport"
      content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>

<style>
body{
    margin:0;
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#080910;
    color:#fff;
    font-family:Arial,sans-serif;
    padding:24px;
    box-sizing:border-box;
}

.box{
    width:100%;
    max-width:500px;
    background:#151724;
    border:1px solid #303448;
    border-radius:24px;
    padding:30px;
    text-align:center;
    box-sizing:border-box;
}

h1{
    margin-top:0;
}

p{
    color:#b8bdcc;
    line-height:1.6;
}
</style>
</head>

<body>
<div class="box">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
</div>
</body>
</html>
`;
}

function createFreeKeyPage({
    key,
    expiresAt,
    websiteUrl
}) {
    const safeKey = escapeHtml(key);
    const safeWebsite = escapeHtml(websiteUrl);

    return `
<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>HRRY Free Key</title>

<style>

*{
    box-sizing:border-box;
}

body{
    margin:0;
    min-height:100vh;

    display:flex;
    align-items:center;
    justify-content:center;

    padding:24px;

    background:
        radial-gradient(
            circle at top,
            #26316e 0%,
            #0a0b12 55%
        );

    color:#fff;

    font-family:
        Arial,
        Helvetica,
        sans-serif;
}

.card{
    width:100%;
    max-width:520px;

    padding:30px;

    border-radius:28px;

    background:
        rgba(25,28,45,.94);

    border:1px solid
        rgba(255,255,255,.12);

    box-shadow:
        0 30px 80px
        rgba(0,0,0,.45);

    text-align:center;
}

.icon{
    font-size:52px;
    margin-bottom:10px;
}

h1{
    margin:0 0 10px;
    font-size:30px;
}

.subtitle{
    color:#b8bdd0;
    line-height:1.5;
}

.key{
    margin:25px 0;

    padding:20px;

    border-radius:18px;

    background:#10121d;

    border:1px solid
        rgba(130,110,255,.5);

    font-size:23px;
    font-weight:800;

    letter-spacing:1px;

    word-break:break-all;
}

.copy{
    border:0;
    width:100%;

    padding:16px;

    border-radius:15px;

    background:
        linear-gradient(
            135deg,
            #5d5cff,
            #a047ff
        );

    color:white;

    font-size:17px;
    font-weight:800;

    cursor:pointer;
}

.timer{
    margin-top:18px;
    color:#ffcf55;
    font-weight:700;
}

.back{
    display:inline-block;
    margin-top:22px;
    color:#aeb4ff;
    text-decoration:none;
}

</style>

</head>

<body>

<div class="card">

    <div class="icon">🎁🔑</div>

    <h1>Your Free Key</h1>

    <div class="subtitle">
        This Free Key gives 12-hour test access.
    </div>

    <div class="key" id="key">
        ${safeKey}
    </div>

    <button
        class="copy"
        onclick="copyKey()"
    >
        📋 Copy Free Key
    </button>

    <div
        class="timer"
        id="timer"
    >
        12-hour access
    </div>

    <a
        class="back"
        href="${safeWebsite}"
    >
        ← Back to HRRY Test
    </a>

</div>

<script>

const expiresAt =
    ${Number(expiresAt)};

function updateTimer(){

    const remaining =
        expiresAt - Date.now();

    if(remaining <= 0){

        document.getElementById("timer")
            .textContent =
            "This key has expired.";

        return;
    }

    const totalSeconds =
        Math.floor(
            remaining / 1000
        );

    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;

    document.getElementById("timer")
        .textContent =
        "Expires in " +
        hours + "h " +
        minutes + "m " +
        seconds + "s";

}

async function copyKey(){

    const key =
        document.getElementById("key")
            .innerText
            .trim();

    try{

        await navigator.clipboard
            .writeText(key);

        alert(
            "✅ Free Key copied!"
        );

    }catch(error){

        alert(
            "Key: " + key
        );

    }

}

updateTimer();

setInterval(
    updateTimer,
    1000
);

</script>

</body>
</html>
`;
}

// ============================================================
// 404
// ============================================================

app.use((req, res) => {
    res.status(404).json({
        ok: false,
        error: "Route not found."
    });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((error, req, res, next) => {

    console.error(
        "❌ Global server error:",
        error
    );

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        ok: false,
        error:
            error.message ||
            "Internal server error."
    });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================================"
        );

        console.log(
            "🚀 HRRY Test Free Key Backend Started"
        );

        console.log(
            "PORT:",
            PORT
        );

        console.log(
            "BACKEND_URL:",
            BACKEND_URL
        );

        console.log(
            "WEBSITE_URL:",
            WEBSITE_URL
        );

        console.log(
            "FIREBASE:",
            firebaseReady
                ? "CONNECTED"
                : "NOT CONNECTED"
        );

        console.log(
            "================================================"
        );
    }
);
