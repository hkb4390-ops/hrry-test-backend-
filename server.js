// ============================================================
// HRRY.TEST - FREE KEY BACKEND
// ============================================================
// Features:
// 1. New Free Key on every request
// 2. New ShrinkMe link for every key
// 3. Same ShrinkMe link ALWAYS shows the same key
// 4. Key validity = 12 hours
// 5. Device binding
// 6. One-time redemption
// 7. Firestore persistent storage
// 8. Paid/Permanent key system is NOT touched
// ============================================================

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json());

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================
//
// Render me ye variables add karna:
//
// SHRINKME_API_KEY = tumhara ShrinkMe API token
// WEBSITE_URL      = https://hrry.test
// FIREBASE_SERVICE_ACCOUNT = Firebase service account JSON
//
// IMPORTANT:
// Real API token ko kabhi frontend/index.html me mat daalna.
// ============================================================

const PORT = process.env.PORT || 8080;

const WEBSITE_URL = (
    process.env.WEBSITE_URL ||
    "https://hrry.test"
).replace(/\/+$/, "");

const SHRINKME_API_KEY = process.env.SHRINKME_API_KEY;

if (!SHRINKME_API_KEY) {
    console.error("❌ SHRINKME_API_KEY missing");
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ FIREBASE_SERVICE_ACCOUNT missing");
}

// ============================================================
// FIREBASE / FIRESTORE
// ============================================================

let db;

try {
    const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT
    );

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    db = admin.firestore();

    console.log("✅ Firebase Admin connected");
} catch (error) {
    console.error(
        "❌ Firebase initialization failed:",
        error.message
    );
}

// ============================================================
// COLLECTION
// ============================================================

const FREE_KEYS_COLLECTION = "hrry_free_keys";

// ============================================================
// HELPERS
// ============================================================

function generateKey() {
    // Example:
    // HRRY-7262
    // HRRY-4819
    // HRRY-9051

    const number = crypto
        .randomInt(1000, 10000)
        .toString();

    return `HRRY-${number}`;
}

function generateRequestId() {
    return crypto.randomBytes(18).toString("hex");
}

function generateSecretToken() {
    return crypto.randomBytes(32).toString("hex");
}

function normalizeDeviceId(deviceId) {
    if (!deviceId) return "";

    return String(deviceId)
        .trim()
        .slice(0, 200);
}

function isValidDeviceId(deviceId) {
    return (
        typeof deviceId === "string" &&
        deviceId.length >= 8 &&
        deviceId.length <= 200
    );
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "HRRY.TEST Free Key Backend",
        status: "online",
        version: "1.0.0"
    });
});

// ============================================================
// CREATE NEW FREE KEY
// ============================================================
//
// POST /api/free/start
//
// Body:
//
// {
//   "deviceId": "USER_DEVICE_ID"
// }
//
// Response:
//
// {
//   success: true,
//   key: "HRRY-7262",
//   shrinkmeUrl: "...",
//   expiresAt: "..."
// }
//
// ============================================================

app.post("/api/free/start", async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({
                success: false,
                message: "Database is not connected"
            });
        }

        if (!SHRINKME_API_KEY) {
            return res.status(500).json({
                success: false,
                message: "ShrinkMe API is not configured"
            });
        }

        const deviceId = normalizeDeviceId(req.body.deviceId);

        if (!isValidDeviceId(deviceId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid device ID"
            });
        }

        // ----------------------------------------------------
        // NEW KEY
        // ----------------------------------------------------

        const key = generateKey();

        // ----------------------------------------------------
        // UNIQUE REQUEST
        // ----------------------------------------------------

        const requestId = generateRequestId();

        // Secret token means the destination cannot be guessed
        // simply by knowing the request ID.
        const secretToken = generateSecretToken();

        // ----------------------------------------------------
        // 12 HOURS
        // ----------------------------------------------------

        const createdAt = Date.now();

        const expiresAt =
            createdAt +
            (12 * 60 * 60 * 1000);

        // ----------------------------------------------------
        // DESTINATION
        // ----------------------------------------------------
        //
        // IMPORTANT:
        //
        // This destination belongs ONLY to this key.
        //
        // Opening this URL again will fetch the SAME Firestore
        // document and therefore the SAME key.
        //
        // It will NOT generate another key.
        //
        // ----------------------------------------------------

        const destinationUrl =
            `${WEBSITE_URL}/free/${requestId}/${secretToken}`;

        // ----------------------------------------------------
        // CREATE FIRESTORE RECORD
        // ----------------------------------------------------

        const freeKeyData = {
            requestId,

            key,

            deviceId,

            secretToken,

            createdAt,

            expiresAt,

            used: false,

            usedAt: null,

            status: "created",

            shrinkmeUrl: null,

            destinationUrl,

            createdFrom: "hrry.test",

            type: "free",

            durationHours: 12
        };

        await db
            .collection(FREE_KEYS_COLLECTION)
            .doc(requestId)
            .set(freeKeyData);

        // ----------------------------------------------------
        // CREATE SHRINKME LINK
        // ----------------------------------------------------

        const params = new URLSearchParams();

        params.set("api", SHRINKME_API_KEY);
        params.set("url", destinationUrl);

        // API request
        const shrinkmeResponse = await fetch(
            `https://shrinkme.io/api?${params.toString()}`
        );

        const shrinkmeText =
            await shrinkmeResponse.text();

        let shrinkmeData;

        try {
            shrinkmeData = JSON.parse(shrinkmeText);
        } catch {
            shrinkmeData = {
                raw: shrinkmeText
            };
        }

        // ----------------------------------------------------
        // CHECK SHRINKME RESPONSE
        // ----------------------------------------------------

        if (
            !shrinkmeData ||
            shrinkmeData.status !== "success" ||
            !shrinkmeData.shortenedUrl
        ) {
            await db
                .collection(FREE_KEYS_COLLECTION)
                .doc(requestId)
                .update({
                    status: "shrinkme_failed",
                    shrinkmeResponse: shrinkmeData
                });

            return res.status(502).json({
                success: false,
                message: "ShrinkMe link could not be created"
            });
        }

        const shrinkmeUrl =
            shrinkmeData.shortenedUrl;

        // ----------------------------------------------------
        // SAVE SHRINKME URL
        // ----------------------------------------------------

        await db
            .collection(FREE_KEYS_COLLECTION)
            .doc(requestId)
            .update({
                shrinkmeUrl,
                status: "ready"
            });

        // ----------------------------------------------------
        // FINAL RESPONSE
        // ----------------------------------------------------

        return res.json({
            success: true,

            message:
                "New free key created successfully",

            requestId,

            key,

            shrinkmeUrl,

            expiresAt,

            durationHours: 12
        });

    } catch (error) {

        console.error(
            "FREE START ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});

// ============================================================
// FIXED KEY DESTINATION
// ============================================================
//
// GET:
//
// /free/:requestId/:secretToken
//
// VERY IMPORTANT:
//
// This route DOES NOT generate a key.
//
// It only reads the existing Firestore record.
//
// Therefore:
//
// Link A -> HRRY-7262
//
// Opening Link A again:
//
// Link A -> HRRY-7262
//
// Forever same record.
//
// ============================================================

app.get(
    "/free/:requestId/:secretToken",
    async (req, res) => {

        try {

            if (!db) {
                return res.status(500).send(
                    "Database unavailable"
                );
            }

            const {
                requestId,
                secretToken
            } = req.params;

            const docRef = db
                .collection(FREE_KEYS_COLLECTION)
                .doc(requestId);

            const snapshot =
                await docRef.get();

            if (!snapshot.exists) {
                return res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport"
                              content="width=device-width,
                              initial-scale=1">
                        <title>Free Key</title>
                    </head>

                    <body style="
                        background:#080808;
                        color:white;
                        font-family:Arial;
                        text-align:center;
                        padding:50px 20px;
                    ">

                        <h2>Link Not Found</h2>

                        <p>
                            This free-key link is invalid.
                        </p>

                    </body>
                    </html>
                `);
            }

            const data = snapshot.data();

            // ------------------------------------------------
            // SECRET TOKEN CHECK
            // ------------------------------------------------

            if (
                data.secretToken !==
                secretToken
            ) {
                return res.status(403).send(
                    "Invalid link"
                );
            }

            // ------------------------------------------------
            // EXPIRY CHECK
            // ------------------------------------------------

            const now = Date.now();

            const expired =
                now > data.expiresAt;

            // ------------------------------------------------
            // SAME FIXED KEY
            // ------------------------------------------------
            //
            // No generateKey() here.
            //
            // We use data.key from Firestore.
            //
            // ------------------------------------------------

            if (expired) {

                return res.send(`
                    <!DOCTYPE html>

                    <html>
                    <head>

                        <meta charset="UTF-8">

                        <meta name="viewport"
                              content="width=device-width,
                              initial-scale=1">

                        <title>Free Key Expired</title>

                    </head>

                    <body style="
                        margin:0;
                        background:#070707;
                        color:white;
                        font-family:Arial;
                        display:flex;
                        justify-content:center;
                        align-items:center;
                        min-height:100vh;
                        text-align:center;
                    ">

                        <div>

                            <h1>
                                Free Key Expired
                            </h1>

                            <p>
                                This key was valid
                                for 12 hours.
                            </p>

                        </div>

                    </body>
                    </html>
                `);
            }

            // ------------------------------------------------
            // SHOW SAME KEY
            // ------------------------------------------------

            return res.send(`
                <!DOCTYPE html>

                <html>

                <head>

                    <meta charset="UTF-8">

                    <meta name="viewport"
                          content="width=device-width,
                          initial-scale=1">

                    <title>HRRY.TEST Free Key</title>

                    <style>

                        * {
                            box-sizing:border-box;
                        }

                        body {
                            margin:0;
                            min-height:100vh;
                            background:
                                radial-gradient(
                                    circle at top,
                                    #182848,
                                    #050505 60%
                                );
                            color:white;
                            font-family:
                                Arial,
                                sans-serif;

                            display:flex;
                            justify-content:center;
                            align-items:center;

                            padding:20px;
                        }

                        .box {
                            width:100%;
                            max-width:430px;

                            background:
                                rgba(255,255,255,.08);

                            border:1px solid
                                rgba(255,255,255,.15);

                            border-radius:24px;

                            padding:30px 22px;

                            text-align:center;

                            backdrop-filter:
                                blur(20px);

                            box-shadow:
                                0 20px 60px
                                rgba(0,0,0,.45);
                        }

                        .logo {
                            font-size:28px;
                            font-weight:900;
                            margin-bottom:8px;
                        }

                        .subtitle {
                            color:#aaa;
                            font-size:14px;
                            margin-bottom:25px;
                        }

                        .key {
                            font-size:32px;
                            font-weight:900;

                            letter-spacing:3px;

                            padding:20px 10px;

                            border-radius:16px;

                            background:
                                rgba(255,255,255,.1);

                            border:
                                1px solid
                                rgba(255,255,255,.2);

                            margin:20px 0;

                            user-select:all;
                        }

                        .copy {
                            border:0;

                            padding:13px 25px;

                            border-radius:12px;

                            background:#ffffff;

                            color:#000;

                            font-weight:800;

                            font-size:15px;

                            cursor:pointer;
                        }

                        .info {
                            margin-top:20px;

                            color:#aaa;

                            font-size:13px;

                            line-height:1.6;
                        }

                    </style>

                </head>

                <body>

                    <div class="box">

                        <div class="logo">
                            HRRY.TEST
                        </div>

                        <div class="subtitle">
                            Your Free Access Key
                        </div>

                        <div class="key"
                             id="key">
                            ${data.key}
                        </div>

                        <button
                            class="copy"
                            onclick="copyKey()">

                            Copy Key

                        </button>

                        <div class="info">

                            This is the fixed key
                            assigned to this link.

                            <br><br>

                            Valid for 12 hours
                            from creation.

                        </div>

                    </div>

                    <script>

                        function copyKey() {

                            const key =
                                document
                                .getElementById("key")
                                .innerText
                                .trim();

                            navigator
                                .clipboard
                                .writeText(key)
                                .then(() => {

                                    alert(
                                        "Key copied!"
                                    );

                                })
                                .catch(() => {

                                    alert(
                                        "Copy failed"
                                    );

                                });

                        }

                    </script>

                </body>

                </html>
            `);

        } catch (error) {

            console.error(
                "FREE DESTINATION ERROR:",
                error
            );

            return res.status(500).send(
                "Server error"
            );
        }
    }
);

// ============================================================
// REDEEM FREE KEY
// ============================================================
//
// POST /api/free/redeem
//
// Body:
//
// {
//   "key": "HRRY-7262",
//   "deviceId": "DEVICE_ID"
// }
//
// Checks:
//
// 1. Key exists
// 2. Device matches
// 3. Key not already used
// 4. Key not expired
//
// ============================================================

app.post(
    "/api/free/redeem",
    async (req, res) => {

        try {

            if (!db) {
                return res.status(500).json({
                    success:false,
                    message:
                        "Database unavailable"
                });
            }

            const key =
                String(req.body.key || "")
                    .trim()
                    .toUpperCase();

            const deviceId =
                normalizeDeviceId(
                    req.body.deviceId
                );

            if (!key) {
                return res.status(400).json({
                    success:false,
                    message:
                        "Key is required"
                });
            }

            if (!isValidDeviceId(deviceId)) {
                return res.status(400).json({
                    success:false,
                    message:
                        "Invalid device ID"
                });
            }

            // ------------------------------------------------
            // FIND KEY
            // ------------------------------------------------

            const querySnapshot =
                await db
                    .collection(
                        FREE_KEYS_COLLECTION
                    )
                    .where(
                        "key",
                        "==",
                        key
                    )
                    .limit(1)
                    .get();

            if (querySnapshot.empty) {
                return res.status(404).json({
                    success:false,
                    message:
                        "Invalid free key"
                });
            }

            const doc =
                querySnapshot.docs[0];

            const data = doc.data();

            // ------------------------------------------------
            // DEVICE CHECK
            // ------------------------------------------------

            if (
                data.deviceId !==
                deviceId
            ) {

                return res.status(403).json({
                    success:false,
                    message:
                        "This key belongs to another device"
                });
            }

            // ------------------------------------------------
            // USED CHECK
            // ------------------------------------------------

            if (data.used === true) {

                return res.status(403).json({
                    success:false,
                    message:
                        "This key has already been used"
                });
            }

            // ------------------------------------------------
            // EXPIRY CHECK
            // ------------------------------------------------

            const now = Date.now();

            if (
                now > data.expiresAt
            ) {

                return res.status(403).json({
                    success:false,
                    message:
                        "This key has expired"
                });
            }

            // ------------------------------------------------
            // MARK AS USED
            // ------------------------------------------------

            await doc.ref.update({

                used: true,

                usedAt: now,

                status: "activated"

            });

            // ------------------------------------------------
            // SUCCESS
            // ------------------------------------------------

            return res.json({

                success:true,

                message:
                    "Free key activated",

                key:data.key,

                deviceId:data.deviceId,

                expiresAt:data.expiresAt,

                durationHours:12

            });

        } catch (error) {

            console.error(
                "FREE REDEEM ERROR:",
                error
            );

            return res.status(500).json({
                success:false,
                message:
                    "Server error"
            });
        }
    }
);

// ============================================================
// CHECK FREE ACCESS
// ============================================================
//
// POST /api/free/status
//
// Body:
//
// {
//   "deviceId": "DEVICE_ID"
// }
//
// ============================================================

app.post(
    "/api/free/status",
    async (req, res) => {

        try {

            if (!db) {
                return res.status(500).json({
                    success:false
                });
            }

            const deviceId =
                normalizeDeviceId(
                    req.body.deviceId
                );

            if (!isValidDeviceId(deviceId)) {
                return res.status(400).json({
                    success:false,
                    message:
                        "Invalid device ID"
                });
            }

            const snapshot =
                await db
                    .collection(
                        FREE_KEYS_COLLECTION
                    )
                    .where(
                        "deviceId",
                        "==",
                        deviceId
                    )
                    .where(
                        "status",
                        "==",
                        "activated"
                    )
                    .orderBy(
                        "expiresAt",
                        "desc"
                    )
                    .limit(1)
                    .get();

            if (snapshot.empty) {

                return res.json({
                    success:true,
                    active:false
                });

            }

            const data =
                snapshot.docs[0].data();

            const now = Date.now();

            if (
                now >= data.expiresAt
            ) {

                return res.json({
                    success:true,
                    active:false,
                    expired:true
                });

            }

            return res.json({

                success:true,

                active:true,

                key:data.key,

                expiresAt:data.expiresAt,

                remainingMs:
                    data.expiresAt - now

            });

        } catch (error) {

            console.error(
                "FREE STATUS ERROR:",
                error
            );

            return res.status(500).json({
                success:false,
                message:
                    "Server error"
            });
        }
    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 HRRY Free Key Backend running on port ${PORT}`
        );

        console.log(
            `🌐 Website: ${WEBSITE_URL}`
        );

        console.log(
            `🗄️ Firestore collection: ${FREE_KEYS_COLLECTION}`
        );

    }
);
