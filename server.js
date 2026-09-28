// ============================================================
// HRRY TEST - FREE KEY BACKEND
// Express + Firebase Realtime Database + ShrinkMe
// ============================================================

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const admin = require("firebase-admin");

// ============================================================
// APP
// ============================================================

const app = express();

// ============================================================
// BASIC MIDDLEWARE
// ============================================================

app.use(
    express.json({
        limit: "1mb"
    })
);

// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================

const PORT =
    process.env.PORT || 10000;

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

const SHRINKME_API_KEY =
    process.env.SHRINKME_API_KEY || "";

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

    // Requests without Origin
    // are allowed for direct server/API access.
    if (!origin) {
        return true;
    }

    // Main website
    if (allowedOrigins.has(origin)) {
        return true;
    }

    // Vercel preview deployments
    try {

        const url =
            new URL(origin);

        if (
            url.protocol === "https:" &&
            url.hostname.endsWith(".vercel.app")
        ) {
            return true;
        }

    } catch (_) {}

    // Local development
    if (
        origin.startsWith(
            "http://localhost:"
        ) ||
        origin.startsWith(
            "http://127.0.0.1:"
        )
    ) {
        return true;
    }

    return false;
}

app.use(
    cors({

        origin: function (
            origin,
            callback
        ) {

            if (
                isAllowedOrigin(origin)
            ) {

                callback(
                    null,
                    true
                );

            } else {

                callback(
                    new Error(
                        "CORS blocked"
                    )
                );

            }

        },

        methods: [
            "GET",
            "POST",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization"
        ],

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

        // ----------------------------------------------------
        // Check service account
        // ----------------------------------------------------

        if (
            !FIREBASE_SERVICE_ACCOUNT
        ) {

            throw new Error(
                "FIREBASE_SERVICE_ACCOUNT environment variable is missing."
            );

        }

        // ----------------------------------------------------
        // Parse JSON
        // ----------------------------------------------------

        let serviceAccount;

        try {

            serviceAccount =
                JSON.parse(
                    FIREBASE_SERVICE_ACCOUNT
                );

        } catch (error) {

            throw new Error(
                "FIREBASE_SERVICE_ACCOUNT contains invalid JSON."
            );

        }

        // ----------------------------------------------------
        // Required fields
        // ----------------------------------------------------

        if (
            !serviceAccount.project_id
        ) {

            throw new Error(
                "Firebase service account is missing project_id."
            );

        }

        if (
            !serviceAccount.private_key
        ) {

            throw new Error(
                "Firebase service account is missing private_key."
            );

        }

        if (
            !serviceAccount.client_email
        ) {

            throw new Error(
                "Firebase service account is missing client_email."
            );

        }

        // ----------------------------------------------------
        // Fix escaped newline
        // ----------------------------------------------------

        serviceAccount.private_key =
            serviceAccount.private_key.replace(
                /\\n/g,
                "\n"
            );

        // ----------------------------------------------------
        // Initialize Firebase
        // ----------------------------------------------------

        if (
            !admin.apps.length
        ) {

            admin.initializeApp({

                credential:
                    admin.credential.cert(
                        serviceAccount
                    ),

                databaseURL:
                    FIREBASE_DB_URL

            });

        }

        // ----------------------------------------------------
        // Database
        // ----------------------------------------------------

        db =
            admin.database();

        firebaseReady = true;

        firebaseInitError = null;

        console.log(
            "================================================"
        );

        console.log(
            "✅ Firebase Admin initialized successfully."
        );

        console.log(
            "✅ Firebase project:",
            serviceAccount.project_id
        );

        console.log(
            "✅ Firebase database:",
            FIREBASE_DB_URL
        );

        console.log(
            "================================================"
        );

    } catch (error) {

        firebaseReady = false;

        db = null;

        firebaseInitError =
            error;

        console.error(
            "❌ Firebase initialization failed:"
        );

        console.error(
            error.message
        );

    }

}

initializeFirebase();

// ============================================================
// DATABASE CHECK
// ============================================================

function ensureDatabase() {

    if (
        !firebaseReady ||
        !db
    ) {

        throw new Error(
            "Firebase database is not initialized."
        );

    }

    return db;
}

// ============================================================
// STRING CLEANER
// ============================================================

function cleanString(
    value,
    maxLength = 500
) {

    if (
        typeof value !==
        "string"
    ) {

        return "";

    }

    return value
        .trim()
        .slice(
            0,
            maxLength
        );
}

// ============================================================
// RANDOM HELPERS
// ============================================================

function createRandomHex(
    bytes = 16
) {

    return crypto
        .randomBytes(bytes)
        .toString("hex");

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
        crypto
            .randomBytes(8)
            .toString("hex")
            .toUpperCase()
    );

}

// ============================================================
// DEVICE HASH
// ============================================================

function hashDeviceId(
    deviceId
) {

    return crypto
        .createHash("sha256")
        .update(
            String(deviceId)
        )
        .digest("hex");

}

// ============================================================
// TIME HELPERS
// ============================================================

function getNow() {

    return Date.now();

}

function getExpiry(
    hours = 12
) {

    return (
        getNow() +
        hours *
        60 *
        60 *
        1000
    );

}

function isExpired(
    expiresAt
) {

    if (
        !expiresAt
    ) {

        return true;

    }

    return (
        getNow() >=
        Number(expiresAt)
    );

}

// ============================================================
// SAFE HTML
// ============================================================

function escapeHtml(
    value
) {

    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}

// ============================================================
// HEALTH
// ============================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            ok: true,

            service:
                "HRRY Test Free Key Backend",

            firebase:
                firebaseReady,

            firebaseError:
                firebaseReady
                    ? null
                    : (
                        firebaseInitError
                            ?.message ||
                        "Unknown Firebase error"
                    ),

            backendUrl:
                BACKEND_URL,

            websiteUrl:
                WEBSITE_URL,

            time:
                new Date()
                    .toISOString()

        });

    }
);

// ============================================================
// HEALTH ENDPOINT
// ============================================================

app.get(
    "/health",
    (req, res) => {

        res.status(200).json({

            ok: true,

            firebase:
                firebaseReady,

            firebaseError:
                firebaseReady
                    ? null
                    : (
                        firebaseInitError
                            ?.message ||
                        "Unknown Firebase error"
                    ),

            time:
                new Date()
                    .toISOString()

        });

    }
);

// ============================================================
// START FREE KEY
// ============================================================

app.post(
    "/api/free/start",
    async (
        req,
        res
    ) => {

        try {

            const database =
                ensureDatabase();

            // ------------------------------------------------
            // ShrinkMe key check
            // ------------------------------------------------

            if (
                !SHRINKME_API_KEY
            ) {

                return res
                    .status(500)
                    .json({

                        ok: false,

                        error:
                            "SHRINKME_API_KEY is not configured on the server."

                    });

            }

            // ------------------------------------------------
            // Device ID
            // ------------------------------------------------

            const deviceId =
                cleanString(
                    req.body?.deviceId,
                    300
                );

            if (!deviceId) {

                return res
                    .status(400)
                    .json({

                        ok: false,

                        error:
                            "Device ID is required."

                    });

            }

            // ------------------------------------------------
            // Generate values
            // ------------------------------------------------

            const requestId =
                createRequestId();

            const secretToken =
                createSecretToken();

            const key =
                createFreeKey();

            const createdAt =
                getNow();

            const expiresAt =
                getExpiry(12);

            const deviceIdHash =
                hashDeviceId(
                    deviceId
                );

            // ------------------------------------------------
            // Destination
            // ------------------------------------------------

            const destinationUrl =
                `${BACKEND_URL}/free/${requestId}/${secretToken}`;

            // ------------------------------------------------
            // Firebase record
            // ------------------------------------------------

            const record = {

                key,

                type:
                    "free",

                durationHours:
                    12,

                requestId,

                secretToken,

                deviceIdHash,

                createdAt,

                expiresAt,

                used:
                    false,

                usedAt:
                    null,

                status:
                    "created",

                shrinkmeUrl:
                    null,

                destinationUrl

            };

            // ------------------------------------------------
            // Save main record
            // ------------------------------------------------

            await database

                .ref(
                    `hrry_free_keys/${requestId}`
                )

                .set(record);

            // ------------------------------------------------
            // Key index
            // ------------------------------------------------

            await database

                .ref(
                    `hrry_free_key_index/${key}`
                )

                .set(requestId);

            // ------------------------------------------------
            // Device index
            //
            // This points to the latest key created
            // for this device.
            // ------------------------------------------------

            await database

                .ref(
                    `hrry_free_device_index/${deviceIdHash}`
                )

                .set(requestId);

            // ------------------------------------------------
            // ShrinkMe
            // ------------------------------------------------

            const shrinkmeApiUrl =
                "https://shrinkme.io/api" +
                "?api=" +
                encodeURIComponent(
                    SHRINKME_API_KEY
                ) +
                "&url=" +
                encodeURIComponent(
                    destinationUrl
                );

            console.log(
                "================================================"
            );

            console.log(
                "🟡 Creating Free Key"
            );

            console.log(
                "Request ID:",
                requestId
            );

            console.log(
                "Device Hash:",
                deviceIdHash
            );

            console.log(
                "Expires:",
                new Date(
                    expiresAt
                ).toISOString()
            );

            console.log(
                "================================================"
            );

            const shrinkResponse =
                await fetch(
                    shrinkmeApiUrl,
                    {

                        method:
                            "GET",

                        headers: {

                            Accept:
                                "application/json"

                        }

                    }
                );

            const shrinkText =
                await shrinkResponse.text();

            let shrinkData;

            try {

                shrinkData =
                    JSON.parse(
                        shrinkText
                    );

            } catch (_) {

                shrinkData =
                    null;

            }

            console.log(
                "ShrinkMe HTTP status:",
                shrinkResponse.status
            );

            // ------------------------------------------------
            // ShrinkMe HTTP error
            // ------------------------------------------------

            if (
                !shrinkResponse.ok
            ) {

                await database

                    .ref(
                        `hrry_free_keys/${requestId}/status`
                    )

                    .set(
                        "shrinkme_error"
                    );

                console.error(
                    "❌ ShrinkMe HTTP error:",
                    shrinkText.slice(
                        0,
                        1000
                    )
                );

                return res
                    .status(502)
                    .json({

                        ok: false,

                        error:
                            "ShrinkMe API request failed.",

                        status:
                            shrinkResponse.status

                    });

            }

            // ------------------------------------------------
            // ShrinkMe response validation
            // ------------------------------------------------

            if (
                !shrinkData ||
                shrinkData.status !==
                    "success" ||
                !shrinkData.shortenedUrl
            ) {

                console.error(
                    "❌ ShrinkMe invalid response:"
                );

                console.error(
                    shrinkText.slice(
                        0,
                        1000
                    )
                );

                await database

                    .ref(
                        `hrry_free_keys/${requestId}/status`
                    )

                    .set(
                        "shrinkme_error"
                    );

                return res
                    .status(502)
                    .json({

                        ok: false,

                        error:
                            "ShrinkMe did not return a shortened URL."

                    });

            }

            const shrinkmeUrl =
                String(
                    shrinkData.shortenedUrl
                );

            // ------------------------------------------------
            // Update Firebase
            // ------------------------------------------------

            await database

                .ref(
                    `hrry_free_keys/${requestId}`
                )

                .update({

                    shrinkmeUrl,

                    status:
                        "ready"

                });

            console.log(
                "✅ Free Key created successfully:",
                requestId
            );

            // ------------------------------------------------
            // Response
            // ------------------------------------------------

            return res.json({

                ok: true,

                requestId,

                shrinkmeUrl,

                expiresAt,

                durationHours:
                    12

            });

        } catch (error) {

            console.error(
                "❌ /api/free/start:"
            );

            console.error(
                error
            );

            return res
                .status(500)
                .json({

                    ok: false,

                    error:
                        error.message ||
                        "Free key server error."

                });

        }

    }
);

// ============================================================
// FREE KEY LANDING PAGE
// ============================================================

app.get(
    "/free/:requestId/:secretToken",
    async (
        req,
        res
    ) => {

        try {

            const database =
                ensureDatabase();

            const requestId =
                cleanString(
                    req.params.requestId,
                    100
                );

            const secretToken =
                cleanString(
                    req.params.secretToken,
                    200
                );

            // ------------------------------------------------
            // Validate URL
            // ------------------------------------------------

            if (
                !requestId ||
                !secretToken
            ) {

                return res
                    .status(400)
                    .send(
                        createHtmlPage(
                            "Invalid Free Key",
                            "यह Free Key link valid नहीं है।"
                        )
                    );

            }

            // ------------------------------------------------
            // Get record
            // ------------------------------------------------

            const snapshot =
                await database

                    .ref(
                        `hrry_free_keys/${requestId}`
                    )

                    .once(
                        "value"
                    );

            const record =
                snapshot.val();

            // ------------------------------------------------
            // Not found
            // ------------------------------------------------

            if (!record) {

                return res
                    .status(404)
                    .send(
                        createHtmlPage(
                            "Invalid Free Key",
                            "यह Free Key record नहीं मिला।"
                        )
                    );

            }

            // ------------------------------------------------
            // Secret validation
            // ------------------------------------------------

            if (
                record.secretToken !==
                secretToken
            ) {

                return res
                    .status(403)
                    .send(
                        createHtmlPage(
                            "Invalid Link",
                            "यह Free Key link valid नहीं है।"
                        )
                    );

            }

            // ------------------------------------------------
            // Already redeemed
            // ------------------------------------------------

            if (
                record.used === true
            ) {

                return res
                    .status(410)
                    .send(
                        createHtmlPage(
                            "Key Already Redeemed",
                            "यह Free Key पहले ही redeem हो चुकी है।"
                        )
                    );

            }

            // ------------------------------------------------
            // Expired
            // ------------------------------------------------

            if (
                isExpired(
                    record.expiresAt
                )
            ) {

                return res
                    .status(410)
                    .send(
                        createHtmlPage(
                            "Key Expired",
                            "यह Free Key expire हो चुकी है।"
                        )
                    );

            }

            // ------------------------------------------------
            // Show key
            // ------------------------------------------------

            return res.send(

                createFreeKeyPage({

                    key:
                        record.key,

                    expiresAt:
                        record.expiresAt,

                    websiteUrl:
                        WEBSITE_URL

                })

            );

        } catch (error) {

            console.error(
                "❌ /free/:requestId/:secretToken:"
            );

            console.error(
                error
            );

            return res
                .status(500)
                .send(
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

app.post(
    "/api/free/redeem",
    async (
        req,
        res
    ) => {

        try {

            const database =
                ensureDatabase();

            // ------------------------------------------------
            // Input
            // ------------------------------------------------

            const key =
                cleanString(
                    req.body?.key,
                    100
                )
                    .toUpperCase();

            const deviceId =
                cleanString(
                    req.body?.deviceId,
                    300
                );

            // ------------------------------------------------
            // Basic validation
            // ------------------------------------------------

            if (!key) {

                return res
                    .status(400)
                    .json({

                        ok: false,

                        error:
                            "Key is required."

                    });

            }

            if (!deviceId) {

                return res
                    .status(400)
                    .json({

                        ok: false,

                        error:
                            "Device ID is required."

                    });

            }

            // ------------------------------------------------
            // Free key prefix
            // ------------------------------------------------

            if (
                !key.startsWith(
                    "HRRY-FREE-"
                )
            ) {

                return res
                    .status(400)
                    .json({

                        ok: false,

                        error:
                            "यह Free Key नहीं है।"

                    });

            }

            const deviceIdHash =
                hashDeviceId(
                    deviceId
                );

            console.log(
                "================================================"
            );

            console.log(
                "🟡 FREE KEY REDEEM REQUEST"
            );

            console.log(
                "Key:",
                key
            );

            console.log(
                "Device Hash:",
                deviceIdHash
            );

            console.log(
                "================================================"
            );

            // ------------------------------------------------
            // Find request ID
            // ------------------------------------------------

            const keyIndexSnapshot =
                await database

                    .ref(
                        `hrry_free_key_index/${key}`
                    )

                    .once(
                        "value"
                    );

            const requestId =
                keyIndexSnapshot.val();

            // ------------------------------------------------
            // Key does not exist
            // ------------------------------------------------

            if (!requestId) {

                console.log(
                    "❌ Redeem failed: key not found"
                );

                return res
                    .status(404)
                    .json({

                        ok: false,

                        code:
                            "KEY_NOT_FOUND",

                        error:
                            "Free Key invalid है।"

                    });

            }

            // ------------------------------------------------
            // Main record
            // ------------------------------------------------

            const keyRef =
                database.ref(
                    `hrry_free_keys/${requestId}`
                );

            // ------------------------------------------------
            // Read current record
            // ------------------------------------------------

            const beforeSnapshot =
                await keyRef.once(
                    "value"
                );

            const beforeRecord =
                beforeSnapshot.val();

            if (!beforeRecord) {

                console.log(
                    "❌ Redeem failed: record missing"
                );

                return res
                    .status(404)
                    .json({

                        ok: false,

                        code:
                            "RECORD_NOT_FOUND",

                        error:
                            "Free Key record नहीं मिला।"

                    });

            }

            // ------------------------------------------------
            // DEVICE CHECK
            // ------------------------------------------------

            if (
                beforeRecord.deviceIdHash !==
                deviceIdHash
            ) {

                console.log(
                    "❌ Redeem failed: device mismatch"
                );

                console.log(
                    "Stored:",
                    beforeRecord.deviceIdHash
                );

                console.log(
                    "Received:",
                    deviceIdHash
                );

                return res
                    .status(403)
                    .json({

                        ok: false,

                        code:
                            "DEVICE_MISMATCH",

                        error:
                            "यह Free Key इस device के लिए नहीं है।"

                    });

            }

            // ------------------------------------------------
            // ALREADY USED CHECK
            // ------------------------------------------------

            if (
                beforeRecord.used === true
            ) {

                // --------------------------------------------
                // If already redeemed by SAME device and
                // still within 12 hours, return active.
                //
                // This prevents a legitimate user from
                // losing access after a repeated click.
                // --------------------------------------------

                if (
                    !isExpired(
                        beforeRecord.expiresAt
                    )
                ) {

                    console.log(
                        "ℹ️ Key already redeemed; returning active access."
                    );

                    return res.json({

                        ok: true,

                        alreadyRedeemed:
                            true,

                        key:
                            beforeRecord.key,

                        expiresAt:
                            Number(
                                beforeRecord.expiresAt
                            ),

                        durationHours:
                            12,

                        status:
                            "active"

                    });

                }

                // Expired
                console.log(
                    "❌ Redeem failed: key expired after previous redemption"
                );

                return res
                    .status(409)
                    .json({

                        ok: false,

                        code:
                            "KEY_EXPIRED",

                        error:
                            "Free Key expire हो चुकी है।"

                    });

            }

            // ------------------------------------------------
            // EXPIRY CHECK
            // ------------------------------------------------

            if (
                isExpired(
                    beforeRecord.expiresAt
                )
            ) {

                console.log(
                    "❌ Redeem failed: key expired"
                );

                return res
                    .status(409)
                    .json({

                        ok: false,

                        code:
                            "KEY_EXPIRED",

                        error:
                            "Free Key expire हो चुकी है।"

                    });

            }

            // ------------------------------------------------
            // ATOMIC TRANSACTION
            // ------------------------------------------------

            const transactionResult =
                await keyRef.transaction(

                    (current) => {

                        if (!current) {

                            return;

                        }

                        // Already used
                        if (
                            current.used ===
                            true
                        ) {

                            return;

                        }

                        // Expired
                        if (
                            !current.expiresAt ||
                            getNow() >=
                                Number(
                                    current.expiresAt
                                )
                        ) {

                            return;

                        }

                        // Device mismatch
                        if (
                            current.deviceIdHash !==
                            deviceIdHash
                        ) {

                            return;

                        }

                        // ------------------------------------
                        // REDEEM
                        // ------------------------------------

                        current.used =
                            true;

                        current.usedAt =
                            getNow();

                        current.redeemedAt =
                            getNow();

                        // IMPORTANT:
                        // "used" means redeemed once.
                        // "status active" means access
                        // remains active until expiry.

                        current.status =
                            "active";

                        return current;

                    }

                );

            const committed =
                transactionResult.committed;

            const updatedRecord =
                transactionResult
                    .snapshot
                    .val();

            // ------------------------------------------------
            // Transaction failed
            // ------------------------------------------------

            if (
                !committed ||
                !updatedRecord
            ) {

                console.log(
                    "❌ Transaction was not committed."
                );

                return res
                    .status(409)
                    .json({

                        ok: false,

                        code:
                            "REDEEM_NOT_COMMITTED",

                        error:
                            "Free Key redeem नहीं हो सकी।"

                    });

            }

            // ------------------------------------------------
            // SUCCESS
            // ------------------------------------------------

            console.log(
                "================================================"
            );

            console.log(
                "✅ FREE KEY REDEEMED SUCCESSFULLY"
            );

            console.log(
                "Request ID:",
                requestId
            );

            console.log(
                "Expires:",
                new Date(
                    Number(
                        updatedRecord.expiresAt
                    )
                ).toISOString()
            );

            console.log(
                "================================================"
            );

            return res.json({

                ok: true,

                key:
                    updatedRecord.key,

                expiresAt:
                    Number(
                        updatedRecord.expiresAt
                    ),

                durationHours:
                    12,

                status:
                    "active"

            });

        } catch (error) {

            console.error(
                "❌ /api/free/redeem:"
            );

            console.error(
                error
            );

            return res
                .status(500)
                .json({

                    ok: false,

                    code:
                        "SERVER_ERROR",

                    error:
                        error.message ||
                        "Free Key redeem failed."

                });

        }

    }
);

// ============================================================
// CHECK FREE ACCESS
// ============================================================

app.post(
    "/api/free/status",
    async (
        req,
        res
    ) => {

        try {

            const database =
                ensureDatabase();

            const deviceId =
                cleanString(
                    req.body?.deviceId,
                    300
                );

            // ------------------------------------------------
            // Device required
            // ------------------------------------------------

            if (!deviceId) {

                return res
                    .status(400)
                    .json({

                        ok: false,

                        error:
                            "Device ID is required."

                    });

            }

            const deviceIdHash =
                hashDeviceId(
                    deviceId
                );

            // ------------------------------------------------
            // Device index
            // ------------------------------------------------

            const indexSnapshot =
                await database

                    .ref(
                        `hrry_free_device_index/${deviceIdHash}`
                    )

                    .once(
                        "value"
                    );

            const requestId =
                indexSnapshot.val();

            // ------------------------------------------------
            // No key for device
            // ------------------------------------------------

            if (!requestId) {

                return res.json({

                    ok: true,

                    active:
                        false

                });

            }

            // ------------------------------------------------
            // Get record
            // ------------------------------------------------

            const recordSnapshot =
                await database

                    .ref(
                        `hrry_free_keys/${requestId}`
                    )

                    .once(
                        "value"
                    );

            const record =
                recordSnapshot.val();

            if (!record) {

                return res.json({

                    ok: true,

                    active:
                        false

                });

            }

            // ------------------------------------------------
            // Device verification
            // ------------------------------------------------

            if (
                record.deviceIdHash !==
                deviceIdHash
            ) {

                return res.json({

                    ok: true,

                    active:
                        false

                });

            }

            // ------------------------------------------------
            // Must be redeemed
            // ------------------------------------------------

            if (
                record.used !== true
            ) {

                return res.json({

                    ok: true,

                    active:
                        false

                });

            }

            // ------------------------------------------------
            // Expiration
            // ------------------------------------------------

            if (
                isExpired(
                    record.expiresAt
                )
            ) {

                await database

                    .ref(
                        `hrry_free_keys/${requestId}/status`
                    )

                    .set(
                        "expired"
                    );

                console.log(
                    "ℹ️ Free access expired:",
                    requestId
                );

                return res.json({

                    ok: true,

                    active:
                        false,

                    expired:
                        true

                });

            }

            // ------------------------------------------------
            // ACTIVE
            // ------------------------------------------------

            return res.json({

                ok: true,

                active:
                    true,

                key:
                    record.key,

                expiresAt:
                    Number(
                        record.expiresAt
                    ),

                durationHours:
                    12

            });

        } catch (error) {

            console.error(
                "❌ /api/free/status:"
            );

            console.error(
                error
            );

            return res
                .status(500)
                .json({

                    ok: false,

                    error:
                        error.message ||
                        "Free access status failed."

                });

        }

    }
);

// ============================================================
// GENERIC HTML PAGE
// ============================================================

function createHtmlPage(
    title,
    message
) {

    return `
<!DOCTYPE html>

<html lang="hi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>
${escapeHtml(title)}
</title>

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

    background:
        radial-gradient(
            circle at top,
            #293575 0%,
            #0a0b12 60%
        );

    color:#fff;

    font-family:
        Arial,
        Helvetica,
        sans-serif;

}

.box{

    width:100%;

    max-width:500px;

    padding:30px 22px;

    border-radius:28px;

    background:
        rgba(24,27,45,.96);

    border:
        1px solid
        rgba(255,255,255,.13);

    box-shadow:
        0 30px 80px
        rgba(0,0,0,.55);

    text-align:center;

}

h1{

    margin:0 0 12px;

    font-size:28px;

}

p{

    margin:0;

    color:#b8bdcc;

    line-height:1.7;

    font-size:15px;

}

</style>

</head>

<body>

<div class="box">

    <h1>
        ${escapeHtml(title)}
    </h1>

    <p>
        ${escapeHtml(message)}
    </p>

</div>

</body>

</html>
`;

}

// ============================================================
// FREE KEY UI PAGE
// ============================================================

function createFreeKeyPage({
    key,
    expiresAt,
    websiteUrl
}) {

    const safeKey =
        escapeHtml(key);

    const safeWebsite =
        escapeHtml(websiteUrl);

    return `
<!DOCTYPE html>

<html lang="hi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1,maximum-scale=1"
>

<title>
HRRY Free Key
</title>

<style>

*{
    box-sizing:border-box;
}

html,
body{

    margin:0;

    padding:0;

    width:100%;

    min-height:100%;

}

body{

    min-height:100vh;

    display:flex;

    align-items:center;

    justify-content:center;

    padding:20px;

    background:
        radial-gradient(
            circle at 50% 0%,
            #293575 0%,
            #111426 38%,
            #07080d 75%
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

    padding:30px 22px;

    border-radius:30px;

    background:
        rgba(24,27,45,.96);

    border:
        1px solid
        rgba(255,255,255,.13);

    box-shadow:
        0 30px 90px
        rgba(0,0,0,.55);

    text-align:center;

}

.icon{

    width:82px;

    height:82px;

    margin:0 auto 16px;

    display:flex;

    align-items:center;

    justify-content:center;

    border-radius:24px;

    background:
        linear-gradient(
            145deg,
            rgba(98,91,255,.30),
            rgba(255,180,60,.18)
        );

    border:
        1px solid
        rgba(255,255,255,.14);

    font-size:42px;

}

h1{

    margin:0;

    font-size:30px;

    font-weight:900;

}

.subtitle{

    margin-top:10px;

    color:#b9bfd2;

    font-size:15px;

    line-height:1.6;

}

.key-label{

    margin-top:28px;

    margin-bottom:9px;

    text-align:left;

    color:#aeb5cb;

    font-size:14px;

    font-weight:800;

}

.key{

    width:100%;

    padding:19px 15px;

    border-radius:18px;

    background:#0d0f19;

    border:
        1px solid
        rgba(126,113,255,.55);

    color:#ffffff;

    font-size:21px;

    font-weight:900;

    letter-spacing:1px;

    line-height:1.5;

    word-break:break-all;

    box-shadow:
        inset 0 0 25px
        rgba(94,84,255,.08);

}

.copy{

    width:100%;

    margin-top:18px;

    padding:17px 18px;

    border:0;

    border-radius:17px;

    background:
        linear-gradient(
            135deg,
            #5d5cff,
            #9d45ff
        );

    color:#fff;

    font-size:17px;

    font-weight:900;

    cursor:pointer;

    box-shadow:
        0 12px 30px
        rgba(112,82,255,.28);

    transition:
        transform .15s ease,
        opacity .15s ease;

}

.copy:active{

    transform:
        scale(.97);

}

.copy.copied{

    background:
        linear-gradient(
            135deg,
            #00c878,
            #00a96b
        );

}

.copied-message{

    display:none;

    margin-top:14px;

    padding:13px 14px;

    border-radius:14px;

    background:
        rgba(0,200,120,.10);

    border:
        1px solid
        rgba(0,220,130,.30);

    color:#62efb0;

    font-size:14px;

    font-weight:800;

    line-height:1.5;

}

.copied-message.show{

    display:block;

}

.timer{

    margin-top:18px;

    color:#ffd45c;

    font-size:14px;

    font-weight:800;

}

.back{

    display:none;

    width:100%;

    margin-top:18px;

    padding:17px 18px;

    border-radius:17px;

    background:
        rgba(35,194,255,.10);

    border:
        1px solid
        rgba(35,194,255,.45);

    color:#dff8ff;

    text-decoration:none;

    font-size:17px;

    font-weight:900;

    box-shadow:
        0 10px 28px
        rgba(0,170,255,.10);

}

.back.show{

    display:block;

}

.note{

    margin-top:20px;

    color:#858ca3;

    font-size:12px;

    line-height:1.6;

}

@media(
    max-width:380px
){

    .card{

        padding:
            25px 17px;

        border-radius:
            25px;

    }

    h1{

        font-size:
            26px;

    }

    .key{

        font-size:
            18px;

    }

}

</style>

</head>

<body>

<div class="card">

    <div class="icon">
        🎁🔑
    </div>

    <h1>
        Your Free Key
    </h1>

    <div class="subtitle">
        12 घंटे के Test Series access के लिए
        आपकी Free Key तैयार है।
    </div>

    <div class="key-label">
        🔐 Your Free Access Key
    </div>

    <div
        class="key"
        id="key"
    >
        ${safeKey}
    </div>

    <button
        class="copy"
        id="copyButton"
        type="button"
        onclick="copyKey()"
    >
        📋 Copy Free Key
    </button>

    <div
        class="copied-message"
        id="copiedMessage"
    >
        ✅ Key copied successfully!
        अब नीचे जाकर अपनी HRRY Test website खोलें।
    </div>

    <div
        class="timer"
        id="timer"
    >
        ⏳ 12-hour access
    </div>

    <!--
        BACK BUTTON IS HIDDEN INITIALLY.
        IT APPEARS ONLY AFTER SUCCESSFUL COPY.
    -->

    <a
        class="back"
        id="backButton"
        href="${safeWebsite}"
    >
        🚀 Back to HRRY Test
    </a>

    <div class="note">

        इस key को सुरक्षित रखें।
        Key redeem होने के बाद इसी device पर
        expiry तक access रहेगा।

    </div>

</div>

<script>

const expiresAt =
    ${Number(expiresAt)};

// ============================================================
// TIMER
// ============================================================

function updateTimer(){

    const remaining =
        expiresAt -
        Date.now();

    const timer =
        document.getElementById(
            "timer"
        );

    if(
        remaining <= 0
    ){

        timer.textContent =
            "⏰ This key has expired.";

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

    timer.textContent =
        "⏳ Expires in " +
        hours +
        "h " +
        minutes +
        "m " +
        seconds +
        "s";

}

// ============================================================
// COPY KEY
// ============================================================

async function copyKey(){

    const key =
        document
            .getElementById(
                "key"
            )
            .innerText
            .trim();

    const button =
        document.getElementById(
            "copyButton"
        );

    const message =
        document.getElementById(
            "copiedMessage"
        );

    const backButton =
        document.getElementById(
            "backButton"
        );

    // --------------------------------------------------------
    // Modern Clipboard API
    // --------------------------------------------------------

    try{

        await navigator
            .clipboard
            .writeText(
                key
            );

        button.textContent =
            "✅ Key Copied";

        button.classList.add(
            "copied"
        );

        message.classList.add(
            "show"
        );

        backButton.classList.add(
            "show"
        );

        return;

    }catch(error){

        console.warn(
            "Clipboard API failed:",
            error
        );

    }

    // --------------------------------------------------------
    // Fallback copy
    // --------------------------------------------------------

    try{

        const textarea =
            document.createElement(
                "textarea"
            );

        textarea.value =
            key;

        textarea.style.position =
            "fixed";

        textarea.style.left =
            "-9999px";

        textarea.style.top =
            "0";

        textarea.style.opacity =
            "0";

        document.body.appendChild(
            textarea
        );

        textarea.focus();

        textarea.select();

        const copied =
            document.execCommand(
                "copy"
            );

        textarea.remove();

        if(
            copied
        ){

            button.textContent =
                "✅ Key Copied";

            button.classList.add(
                "copied"
            );

            message.classList.add(
                "show"
            );

            backButton.classList.add(
                "show"
            );

        }else{

            alert(
                "Key copy नहीं हो पाई।\\n\\n" +
                key
            );

        }

    }catch(error){

        console.error(
            "Fallback copy failed:",
            error
        );

        alert(
            "Key copy नहीं हो पाई।\\n\\n" +
            key
        );

    }

}

// ============================================================
// START TIMER
// ============================================================

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

app.use(
    (req, res) => {

        res
            .status(404)
            .json({

                ok: false,

                error:
                    "Route not found."

            });

    }
);

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "❌ Global server error:"
        );

        console.error(
            error
        );

        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }

        res
            .status(500)
            .json({

                ok: false,

                error:
                    error.message ||
                    "Internal server error."

            });

    }
);

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
            "SHRINKME:",
            SHRINKME_API_KEY
                ? "CONFIGURED"
                : "NOT CONFIGURED"
        );

        console.log(
            "================================================"
        );

    }
);
