// server.js

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const { initializeApp, cert } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const WEBSITE_URL =
    (process.env.WEBSITE_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "");

const SHRINKME_API_KEY =
    process.env.SHRINKME_API_KEY || "";

const FIREBASE_DB_URL =
    process.env.FIREBASE_DB_URL ||
    "https://hyuuu-732f9-default-rtdb.firebaseio.com";


// ======================================================
// FIREBASE ADMIN
// ======================================================

let serviceAccount;

try {
    serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT || "{}"
    );
} catch (error) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT JSON");
    process.exit(1);
}

if (!serviceAccount.project_id) {
    console.error("FIREBASE_SERVICE_ACCOUNT is missing project_id");
    process.exit(1);
}

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: FIREBASE_DB_URL
});

const db = getDatabase();


// ======================================================
// SETTINGS
// ======================================================

const FREE_KEY_DURATION = 12 * 60 * 60 * 1000;

const FREE_KEY_PATH = "hrry_free_keys";


// ======================================================
// HELPERS
// ======================================================

function randomPart(length = 8) {
    return crypto
        .randomBytes(32)
        .toString("hex")
        .toUpperCase()
        .slice(0, length);
}


function createRequestId() {
    return (
        Date.now().toString(36) +
        "-" +
        randomPart(10).toLowerCase()
    );
}


function createSecretToken() {
    return crypto
        .randomBytes(32)
        .toString("hex");
}


function createFreeKey() {
    return `HRRY-FREE-${randomPart(4)}-${randomPart(6)}`;
}


function safe(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "medium"
    });
}


// ======================================================
// HEALTH
// ======================================================

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: "hrry.test Free Key Backend",
        freeKeyDuration: "12 hours"
    });
});


// ======================================================
// CREATE NEW FREE KEY
// EVERY REQUEST = NEW KEY + NEW SHRINKME LINK
// ======================================================

app.post("/api/free/start", async (req, res) => {

    try {

        const deviceId =
            String(req.body?.deviceId || "").trim();

        if (!deviceId) {
            return res.status(400).json({
                ok: false,
                error: "deviceId_required"
            });
        }

        if (!WEBSITE_URL) {
            return res.status(500).json({
                ok: false,
                error: "WEBSITE_URL_not_configured"
            });
        }

        if (!SHRINKME_API_KEY) {
            return res.status(500).json({
                ok: false,
                error: "SHRINKME_API_KEY_not_configured"
            });
        }


        // ----------------------------------------------
        // NEW REQUEST ID
        // ----------------------------------------------

        const requestId = createRequestId();

        const secretToken =
            createSecretToken();

        const key =
            createFreeKey();

        const createdAt =
            Date.now();

        const expiresAt =
            createdAt + FREE_KEY_DURATION;


        // ----------------------------------------------
        // DESTINATION
        // SAME REQUEST WILL ALWAYS RETURN SAME KEY
        // ----------------------------------------------

        const destinationUrl =
            `${WEBSITE_URL}/free/${encodeURIComponent(requestId)}/${encodeURIComponent(secretToken)}`;


        // ----------------------------------------------
        // SAVE FIRST
        // ----------------------------------------------

        const record = {

            key,

            type: "free",

            durationHours: 12,

            requestId,

            secretToken,

            deviceId,

            createdAt,

            expiresAt,

            used: false,

            activated: false,

            status: "unused",

            shrinkmeUrl: "",

            destinationUrl

        };


        await db
            .ref(`${FREE_KEY_PATH}/${requestId}`)
            .set(record);


        // ----------------------------------------------
        // SHRINKME
        // ----------------------------------------------

        const shrinkUrl =
            `https://shrinkme.io/api?api=${encodeURIComponent(SHRINKME_API_KEY)}&url=${encodeURIComponent(destinationUrl)}`;


        const shrinkResponse =
            await fetch(shrinkUrl);


        const shrinkText =
            await shrinkResponse.text();


        let shrinkData;

        try {
            shrinkData = JSON.parse(shrinkText);
        } catch {
            shrinkData = null;
        }


        if (
            !shrinkResponse.ok ||
            !shrinkData ||
            shrinkData.status !== "success" ||
            !shrinkData.shortenedUrl
        ) {

            await db
                .ref(`${FREE_KEY_PATH}/${requestId}`)
                .update({
                    status: "shrink_failed",
                    shrinkError: shrinkText.slice(0, 500)
                });

            return res.status(502).json({
                ok: false,
                error: "shrinkme_failed"
            });
        }


        // ----------------------------------------------
        // SAVE SAME SHORT LINK
        // ----------------------------------------------

        await db
            .ref(`${FREE_KEY_PATH}/${requestId}`)
            .update({
                shrinkmeUrl: shrinkData.shortenedUrl,
                status: "ready"
            });


        // ----------------------------------------------
        // RESPONSE
        // ----------------------------------------------

        return res.json({

            ok: true,

            requestId,

            key,

            shrinkmeUrl:
                shrinkData.shortenedUrl,

            expiresAt,

            durationHours: 12

        });

    } catch (error) {

        console.error(
            "FREE START ERROR:",
            error
        );

        return res.status(500).json({
            ok: false,
            error: "server_error"
        });
    }

});


// ======================================================
// SAME SHORT LINK
// ALWAYS SAME KEY
// NEVER GENERATE A NEW KEY HERE
// ======================================================

app.get(
    "/free/:requestId/:secretToken",
    async (req, res) => {

        try {

            const {
                requestId,
                secretToken
            } = req.params;


            const snapshot =
                await db
                    .ref(`${FREE_KEY_PATH}/${requestId}`)
                    .once("value");


            const data =
                snapshot.val();


            if (!data) {
                return res.status(404).send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>hrry.test</title>
</head>
<body style="
margin:0;
background:#080b14;
color:white;
font-family:Arial,sans-serif;
display:flex;
align-items:center;
justify-content:center;
min-height:100vh;
text-align:center;
">
<div>
<h2>❌ Invalid Free Key Link</h2>
<p>This link does not exist.</p>
</div>
</body>
</html>
`);
            }


            if (
                String(data.secretToken) !==
                String(secretToken)
            ) {

                return res.status(403).send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invalid Link</title>
</head>
<body style="
margin:0;
background:#080b14;
color:white;
font-family:Arial,sans-serif;
display:flex;
align-items:center;
justify-content:center;
min-height:100vh;
text-align:center;
">
<div>
<h2>🔒 Invalid Link</h2>
<p>This free-key link is not valid.</p>
</div>
</body>
</html>
`);
            }


            const expired =
                Date.now() > Number(data.expiresAt);


            if (expired) {

                return res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>hrry.test</title>
</head>
<body style="
margin:0;
background:#080b14;
color:white;
font-family:Arial,sans-serif;
display:flex;
align-items:center;
justify-content:center;
min-height:100vh;
text-align:center;
">
<div style="
width:min(420px,90%);
padding:28px;
border-radius:24px;
background:#111827;
border:1px solid #263244;
">
<div style="font-size:45px">⏰</div>
<h2>Free Key Expired</h2>
<p>This 12-hour key has expired.</p>
</div>
</body>
</html>
`);
            }


            return res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>hrry.test Free Key</title>

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
padding:20px;
font-family:Arial,sans-serif;
background:
radial-gradient(circle at top,#172554,#080b14 55%);
color:white;
}

.box{
width:min(430px,100%);
padding:28px;
border-radius:28px;
background:rgba(17,24,39,.92);
border:1px solid rgba(255,255,255,.12);
box-shadow:0 30px 80px rgba(0,0,0,.5);
text-align:center;
}

.icon{
font-size:48px;
margin-bottom:10px;
}

h1{
font-size:23px;
margin:0 0 7px;
}

.sub{
font-size:13px;
color:#94a3b8;
margin-bottom:20px;
}

.key{
padding:17px;
border-radius:17px;
background:rgba(99,102,241,.12);
border:1px solid rgba(99,102,241,.3);
font-size:22px;
font-weight:900;
letter-spacing:1.5px;
word-break:break-word;
margin:15px 0;
}

.info{
font-size:12px;
color:#94a3b8;
line-height:1.6;
}

.btn{
display:block;
text-decoration:none;
margin-top:18px;
padding:14px;
border-radius:14px;
background:#6366f1;
color:white;
font-weight:800;
}

</style>
</head>

<body>

<div class="box">

<div class="icon">🎁</div>

<h1>hrry.test Free Key</h1>

<div class="sub">
12-Hour Free Access
</div>

<div class="key">
${safe(data.key)}
</div>

<div class="info">
यह वही key है जो इस link से permanently linked है।<br>
Key validity: 12 hours<br>
Expires: ${safe(formatDate(data.expiresAt))}
</div>

<a
class="btn"
href="${safe(WEBSITE_URL)}"
>
Open hrry.test
</a>

</div>

</body>
</html>
`);

        } catch (error) {

            console.error(
                "FREE LINK ERROR:",
                error
            );

            return res.status(500).send(
                "Server error"
            );
        }

    }
);


// ======================================================
// REDEEM FREE KEY
// ONE TIME ONLY
// DEVICE BOUND
// ======================================================

app.post(
    "/api/free/redeem",
    async (req, res) => {

        try {

            const key =
                String(req.body?.key || "")
                    .trim()
                    .toUpperCase();

            const deviceId =
                String(req.body?.deviceId || "")
                    .trim();


            if (!key || !deviceId) {

                return res.status(400).json({
                    ok: false,
                    error: "key_and_device_required"
                });

            }


            const snapshot =
                await db
                    .ref(FREE_KEY_PATH)
                    .orderByChild("key")
                    .equalTo(key)
                    .once("value");


            const matches =
                snapshot.val();


            if (!matches) {

                return res.status(404).json({
                    ok: false,
                    error: "invalid_free_key"
                });

            }


            const requestId =
                Object.keys(matches)[0];


            const ref =
                db.ref(
                    `${FREE_KEY_PATH}/${requestId}`
                );


            // ------------------------------------------
            // ATOMIC ONE-TIME REDEEM
            // ------------------------------------------

            let transactionResult;

            try {

                transactionResult =
                    await ref.transaction(
                        current => {

                            if (!current) {
                                return;
                            }

                            const now =
                                Date.now();


                            if (
                                String(current.key)
                                !== String(key)
                            ) {
                                return;
                            }


                            if (
                                String(current.deviceId)
                                !== String(deviceId)
                            ) {
                                return;
                            }


                            if (
                                now >
                                Number(current.expiresAt)
                            ) {
                                return;
                            }


                            if (
                                current.used === true
                            ) {
                                return;
                            }


                            return {
                                ...current,

                                used: true,

                                activated: true,

                                status: "active",

                                usedAt: now,

                                activatedAt: now

                            };

                        }
                    );

            } catch (transactionError) {

                console.error(
                    "Transaction error:",
                    transactionError
                );

                return res.status(500).json({
                    ok: false,
                    error: "redeem_transaction_failed"
                });

            }


            if (
                !transactionResult.committed ||
                !transactionResult.snapshot.exists()
            ) {

                const latest =
                    await ref.once("value");

                const latestData =
                    latest.val();


                if (
                    latestData &&
                    String(latestData.deviceId)
                    !== String(deviceId)
                ) {

                    return res.status(403).json({
                        ok: false,
                        error: "key_bound_to_another_device"
                    });

                }


                if (
                    latestData &&
                    latestData.used === true
                ) {

                    return res.status(409).json({
                        ok: false,
                        error: "key_already_used"
                    });

                }


                return res.status(400).json({
                    ok: false,
                    error: "key_expired_or_invalid"
                });

            }


            const finalData =
                transactionResult.snapshot.val();


            return res.json({

                ok: true,

                key: finalData.key,

                deviceId: finalData.deviceId,

                activatedAt:
                    finalData.activatedAt,

                expiresAt:
                    finalData.expiresAt,

                durationHours: 12

            });

        } catch (error) {

            console.error(
                "FREE REDEEM ERROR:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "server_error"
            });

        }

    }
);


// ======================================================
// CHECK ACTIVE FREE ACCESS
// ======================================================

app.post(
    "/api/free/status",
    async (req, res) => {

        try {

            const deviceId =
                String(req.body?.deviceId || "")
                    .trim();


            if (!deviceId) {

                return res.status(400).json({
                    ok: false,
                    error: "deviceId_required"
                });

            }


            const snapshot =
                await db
                    .ref(FREE_KEY_PATH)
                    .orderByChild("deviceId")
                    .equalTo(deviceId)
                    .once("value");


            const records =
                snapshot.val();


            if (!records) {

                return res.json({
                    ok: true,
                    active: false
                });

            }


            const now =
                Date.now();


            let activeRecord = null;


            for (
                const id of Object.keys(records)
            ) {

                const item =
                    records[id];


                if (
                    item &&
                    item.activated === true &&
                    item.used === true &&
                    Number(item.expiresAt) > now
                ) {

                    if (
                        !activeRecord ||
                        Number(item.expiresAt) >
                        Number(activeRecord.expiresAt)
                    ) {

                        activeRecord = item;

                    }

                }

            }


            if (!activeRecord) {

                return res.json({
                    ok: true,
                    active: false
                });

            }


            return res.json({

                ok: true,

                active: true,

                key: activeRecord.key,

                activatedAt:
                    activeRecord.activatedAt,

                expiresAt:
                    activeRecord.expiresAt,

                remainingMs:
                    Number(activeRecord.expiresAt) - now

            });

        } catch (error) {

            console.error(
                "FREE STATUS ERROR:",
                error
            );

            return res.status(500).json({
                ok: false,
                error: "server_error"
            });

        }

    }
);


// ======================================================
// START SERVER
// ======================================================

app.listen(
    PORT,
    () => {

        console.log(
            `hrry.test Free Key Backend running on port ${PORT}`
        );

    }
);
