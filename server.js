const express = require("express");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "50kb" }));

const PORT = process.env.PORT || 8080;

const SHRINKME_API_KEY = process.env.SHRINKME_API_KEY;

// अपनी वेबसाइट का URL
const WEBSITE_URL = "https://hrry.test";

// Free access duration = 12 hours
const FREE_ACCESS_MS = 12 * 60 * 60 * 1000;

// Request कितनी देर valid रहेगी
const REQUEST_VALID_MS = 30 * 60 * 1000;

// Temporary memory storage.
// IMPORTANT: permanent storage के लिए बाद में PostgreSQL जोड़ना होगा.
const freeRequests = new Map();
const devices = new Map();
const paidKeys = new Map();


// ======================================================
// BASIC
// ======================================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "HRRY Test Backend",
        version: "1.0.0"
    });
});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        backend: "online",
        shrinkmeConfigured: Boolean(SHRINKME_API_KEY)
    });
});


// ======================================================
// DEVICE ID VALIDATION
// ======================================================

function validDeviceId(deviceId) {

    if (typeof deviceId !== "string") {
        return false;
    }

    if (deviceId.length < 8 || deviceId.length > 200) {
        return false;
    }

    return /^[a-zA-Z0-9._:-]+$/.test(deviceId);
}


// ======================================================
// RANDOM ID
// ======================================================

function randomId(bytes = 24) {
    return crypto.randomBytes(bytes).toString("hex");
}


// ======================================================
// FREE KEY - START
// ======================================================

app.post("/api/free/start", async (req, res) => {

    try {

        const { deviceId } = req.body;

        if (!validDeviceId(deviceId)) {

            return res.status(400).json({
                success: false,
                message: "Invalid device ID"
            });

        }

        if (!SHRINKME_API_KEY) {

            return res.status(500).json({
                success: false,
                message: "ShrinkMe API is not configured"
            });

        }


        // --------------------------------------------------
        // Check existing access
        // --------------------------------------------------

        const existingDevice = devices.get(deviceId);

        if (existingDevice) {

            if (existingDevice.permanent === true) {

                return res.json({
                    success: true,
                    access: "permanent",
                    message: "Permanent access already active"
                });

            }

            if (
                existingDevice.freeUntil &&
                existingDevice.freeUntil > Date.now()
            ) {

                return res.json({
                    success: true,
                    access: "free",
                    freeUntil: existingDevice.freeUntil
                });

            }

        }


        // --------------------------------------------------
        // Create ONE-TIME request
        // --------------------------------------------------

        const requestId = randomId(24);

        const secretToken = randomId(32);

        const expiresAt = Date.now() + REQUEST_VALID_MS;


        // --------------------------------------------------
        // Destination URL
        // --------------------------------------------------

        const destination =
            `${WEBSITE_URL}/free-complete` +
            `?request=${encodeURIComponent(requestId)}` +
            `&token=${encodeURIComponent(secretToken)}`;


        // --------------------------------------------------
        // ShrinkMe API
        // --------------------------------------------------

        const apiUrl =
            `https://shrinkme.io/api` +
            `?api=${encodeURIComponent(SHRINKME_API_KEY)}` +
            `&url=${encodeURIComponent(destination)}`;


        const response = await fetch(apiUrl);

        if (!response.ok) {

            throw new Error(
                `ShrinkMe HTTP ${response.status}`
            );

        }


        const data = await response.json();


        console.log("ShrinkMe response:", {
            hasShortenedUrl: Boolean(data.shortenedUrl),
            status: data.status
        });


        if (!data.shortenedUrl) {

            return res.status(502).json({
                success: false,
                message: "ShrinkMe did not return a short URL"
            });

        }


        // --------------------------------------------------
        // Save request
        // --------------------------------------------------

        freeRequests.set(requestId, {

            requestId,
            deviceId,

            secretToken,

            createdAt: Date.now(),
            expiresAt,

            status: "waiting",

            shortUrl: data.shortenedUrl

        });


        // --------------------------------------------------
        // Send short URL
        // --------------------------------------------------

        return res.json({

            success: true,

            status: "waiting",

            requestId,

            shortUrl: data.shortenedUrl,

            expiresAt

        });

    }

    catch (error) {

        console.error("FREE START ERROR:", error);

        return res.status(500).json({

            success: false,

            message: "Unable to create free-key request"

        });

    }

});


// ======================================================
// FREE COMPLETE PAGE
// ======================================================

app.get("/free-complete", (req, res) => {

    const { request, token } = req.query;

    if (!request || !token) {

        return res.status(400).send(`
            <h2>Invalid request</h2>
            <p>Missing verification information.</p>
        `);

    }


    const item = freeRequests.get(request);

    if (!item) {

        return res.status(404).send(`
            <h2>Request not found</h2>
            <p>This request is invalid or expired.</p>
        `);

    }


    if (item.expiresAt < Date.now()) {

        return res.status(410).send(`
            <h2>Request expired</h2>
            <p>Please return to hrry.test and create a new request.</p>
        `);

    }


    if (item.secretToken !== token) {

        return res.status(403).send(`
            <h2>Invalid verification</h2>
        `);

    }


    /*
     * IMPORTANT:
     *
     * We DO NOT grant 12 hours here.
     *
     * Reaching this URL only proves that the destination
     * was reached. It does NOT prove that ShrinkMe's
     * advertising flow was completed.
     *
     * A real ShrinkMe callback/postback is needed before
     * this endpoint can safely grant access.
     */


    res.send(`
<!DOCTYPE html>

<html>
<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width,initial-scale=1">

<title>HRRY Test</title>

<style>

body{
    margin:0;
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#080808;
    color:white;
    font-family:Arial,sans-serif;
    text-align:center;
}

.box{
    width:90%;
    max-width:420px;
    padding:30px;
    border-radius:20px;
    background:#151515;
}

h2{
    margin-top:0;
}

p{
    color:#aaa;
    line-height:1.6;
}

button{
    border:0;
    border-radius:12px;
    padding:14px 22px;
    font-size:16px;
    font-weight:bold;
    cursor:pointer;
}

</style>

</head>

<body>

<div class="box">

<h2>Request Reached</h2>

<p>
The ShrinkMe destination was reached successfully.
</p>

<p>
Access will only be activated after server-side
completion verification is available.
</p>

<button onclick="location.href='${WEBSITE_URL}'">
Return to HRRY Test
</button>

</div>

</body>

</html>
    `);

});


// ======================================================
// ACCESS STATUS
// ======================================================

app.post("/api/access/status", (req, res) => {

    const { deviceId } = req.body;

    if (!validDeviceId(deviceId)) {

        return res.status(400).json({
            success: false,
            message: "Invalid device ID"
        });

    }


    const device = devices.get(deviceId);


    if (!device) {

        return res.json({

            success: true,

            access: false,

            type: "none"

        });

    }


    // --------------------------------------------------
    // Permanent
    // --------------------------------------------------

    if (device.permanent === true) {

        return res.json({

            success: true,

            access: true,

            type: "permanent"

        });

    }


    // --------------------------------------------------
    // Free access
    // --------------------------------------------------

    if (
        device.freeUntil &&
        device.freeUntil > Date.now()
    ) {

        return res.json({

            success: true,

            access: true,

            type: "free",

            freeUntil: device.freeUntil

        });

    }


    return res.json({

        success: true,

        access: false,

        type: "expired"

    });

});


// ======================================================
// ADMIN: GRANT FREE ACCESS
// ======================================================

/*
 * This endpoint is intentionally protected.

 * DO NOT call it from frontend.

 * ADMIN_GRANT_SECRET must be stored in Render
 * Environment Variables.
 */

app.post("/api/admin/grant-free", (req, res) => {

    const adminSecret = req.headers["x-admin-secret"];

    if (
        !process.env.ADMIN_GRANT_SECRET ||
        adminSecret !== process.env.ADMIN_GRANT_SECRET
    ) {

        return res.status(403).json({
            success: false,
            message: "Unauthorized"
        });

    }


    const { deviceId } = req.body;

    if (!validDeviceId(deviceId)) {

        return res.status(400).json({
            success: false,
            message: "Invalid device ID"
        });

    }


    const freeUntil = Date.now() + FREE_ACCESS_MS;


    devices.set(deviceId, {

        permanent: false,

        freeUntil,

        updatedAt: Date.now()

    });


    return res.json({

        success: true,

        access: true,

        type: "free",

        freeUntil

    });

});


// ======================================================
// PAID KEY REDEEM
// ======================================================

app.post("/api/paid/redeem", (req, res) => {

    const { deviceId, key } = req.body;


    if (!validDeviceId(deviceId)) {

        return res.status(400).json({
            success: false,
            message: "Invalid device ID"
        });

    }


    if (
        typeof key !== "string" ||
        key.length < 8 ||
        key.length > 200
    ) {

        return res.status(400).json({
            success: false,
            message: "Invalid key"
        });

    }


    const keyHash = crypto
        .createHash("sha256")
        .update(key)
        .digest("hex");


    const keyData = paidKeys.get(keyHash);


    if (!keyData) {

        return res.status(401).json({

            success: false,

            message: "Invalid or expired key"

        });

    }


    if (keyData.redeemed === true) {

        return res.status(409).json({

            success: false,

            message: "This key has already been used"

        });

    }


    // --------------------------------------------------
    // Permanent device binding
    // --------------------------------------------------

    devices.set(deviceId, {

        permanent: true,

        freeUntil: null,

        updatedAt: Date.now()

    });


    keyData.redeemed = true;

    keyData.deviceId = deviceId;

    keyData.redeemedAt = Date.now();


    return res.json({

        success: true,

        access: true,

        type: "permanent"

    });

});


// ======================================================
// ERROR HANDLER
// ======================================================

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({

        success: false,

        message: "Internal server error"

    });

});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {

    console.log(
        `HRRY Test Backend running on port ${PORT}`
    );

});
