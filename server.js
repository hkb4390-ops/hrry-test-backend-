'use strict';

/*
===========================================================
 HRRY.TEST — FREE KEY BACKEND
 Frontend : https://hrrr-test-free.vercel.app
 Backend  : https://hrry-test-backend.onrender.com

 Firebase Realtime Database
 Free Key : 12 Hours
===========================================================
*/

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT || 10000);

const BACKEND_URL = (
    process.env.BACKEND_URL ||
    'https://hrry-test-backend.onrender.com'
).replace(/\/+$/, '');

const WEBSITE_URL = (
    process.env.WEBSITE_URL ||
    'https://hrrr-test-free.vercel.app'
).replace(/\/+$/, '');

const FIREBASE_DB_URL = (
    process.env.FIREBASE_DB_URL ||
    'https://hyuuu-732f9-default-rtdb.firebaseio.com'
).replace(/\/+$/, '');

const SHRINKME_API_KEY = (
    process.env.SHRINKME_API_KEY || ''
).trim();

const FREE_KEY_DURATION_MS = 12 * 60 * 60 * 1000;


/* =========================================================
   CORS
========================================================= */

const allowedOrigins = new Set([
    'https://hrrr-test-free.vercel.app',
    'https://www.hrrr-test-free.vercel.app'
]);

function isAllowedOrigin(origin) {
    if (!origin) {
        return true;
    }

    if (allowedOrigins.has(origin)) {
        return true;
    }

    /*
      Allow Vercel preview deployments also.
      Example:
      https://hrrr-test-free-git-main-xxxxx.vercel.app
    */
    if (
        /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)
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
                return;
            }

            console.log(
                '❌ CORS blocked origin:',
                origin || '(no origin)'
            );

            callback(
                new Error('Not allowed by CORS')
            );
        },

        methods: [
            'GET',
            'POST',
            'OPTIONS'
        ],

        allowedHeaders: [
            'Content-Type',
            'Authorization'
        ],

        credentials: false,

        optionsSuccessStatus: 204
    })
);


/* =========================================================
   BODY PARSER
========================================================= */

app.use(
    express.json({
        limit: '100kb'
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: '100kb'
    })
);


/* =========================================================
   BASIC HELPERS
========================================================= */

function cleanString(value, maxLength = 500) {
    return String(value || '')
        .trim()
        .slice(0, maxLength);
}


function normalizeKey(value) {
    return cleanString(value, 100)
        .toUpperCase()
        .replace(/\s+/g, '');
}


function hashDeviceId(deviceId) {
    return crypto
        .createHash('sha256')
        .update(String(deviceId))
        .digest('hex');
}


function createRequestId() {
    return crypto
        .randomBytes(18)
        .toString('hex');
}


function createSecretToken() {
    return crypto
        .randomBytes(32)
        .toString('hex');
}


function createFreeKey() {
    return (
        'HRRY-FREE-' +
        crypto
            .randomBytes(8)
            .toString('hex')
            .toUpperCase()
    );
}


function isExpired(expiresAt) {
    return Number(expiresAt || 0) <= Date.now();
}


function getFirebaseServiceAccount() {

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!raw) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT environment variable is missing.'
        );
    }

    let serviceAccount;

    try {
        serviceAccount = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT contains invalid JSON.'
        );
    }

    if (
        !serviceAccount.project_id ||
        !serviceAccount.client_email ||
        !serviceAccount.private_key
    ) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT JSON is incomplete.'
        );
    }

    return serviceAccount;
}


/* =========================================================
   FIREBASE INITIALIZATION
========================================================= */

let db = null;
let firebaseReady = false;

try {

    const serviceAccount =
        getFirebaseServiceAccount();

    if (!admin.apps.length) {

        admin.initializeApp({
            credential:
                admin.credential.cert(serviceAccount),

            databaseURL:
                FIREBASE_DB_URL
        });

    }

    db = admin.database();

    firebaseReady = true;

    console.log(
        '✅ Firebase Admin connected successfully'
    );

    console.log(
        '✅ Firebase project:',
        serviceAccount.project_id
    );

    console.log(
        '✅ Firebase database:',
        FIREBASE_DB_URL
    );

} catch (error) {

    firebaseReady = false;
    db = null;

    console.error(
        '❌ Firebase initialization failed:'
    );

    console.error(error.message);

}


/* =========================================================
   FIREBASE CHECK
========================================================= */

function ensureDatabase() {

    if (!firebaseReady || !db) {

        throw new Error(
            'Firebase database is not initialized.'
        );

    }

    return db;
}


/* =========================================================
   ROOT
========================================================= */

app.get('/', (req, res) => {

    res.status(200).json({
        ok: true,
        service: 'hrry.test Free Key Backend',
        frontend: WEBSITE_URL,
        firebase: firebaseReady,
        time: new Date().toISOString()
    });

});


/* =========================================================
   HEALTH
========================================================= */

app.get('/health', (req, res) => {

    res.status(200).json({
        ok: true,
        firebase: firebaseReady,
        time: new Date().toISOString()
    });

});


/* =========================================================
   START FREE KEY
========================================================= */

app.post('/api/free/start', async (req, res) => {

    console.log('\n========================================');
    console.log('➡️ POST /api/free/start');
    console.log('========================================');

    try {

        const database = ensureDatabase();

        const deviceId =
            cleanString(req.body?.deviceId, 300);

        console.log(
            '📱 deviceId received:',
            deviceId
                ? `${deviceId.slice(0, 12)}...`
                : '(missing)'
        );

        if (!deviceId) {

            console.log(
                '❌ start rejected: deviceId missing'
            );

            return res.status(400).json({
                ok: false,
                error: 'deviceId is required.'
            });

        }


        if (!SHRINKME_API_KEY) {

            console.log(
                '❌ start rejected: SHRINKME_API_KEY missing'
            );

            return res.status(500).json({
                ok: false,
                error:
                    'ShrinkMe API key is not configured on server.'
            });

        }


        const now = Date.now();

        const requestId =
            createRequestId();

        const secretToken =
            createSecretToken();

        const key =
            createFreeKey();

        const expiresAt =
            now + FREE_KEY_DURATION_MS;

        const deviceIdHash =
            hashDeviceId(deviceId);


        /*
          Important:
          ShrinkMe destination points to backend,
          not directly to Vercel.
        */

        const destinationUrl =
            `${BACKEND_URL}/free/${encodeURIComponent(requestId)}/${encodeURIComponent(secretToken)}`;


        const record = {

            key,

            deviceIdHash,

            secretToken,

            requestId,

            createdAt: now,

            expiresAt,

            used: false,

            usedAt: null,

            redeemedAt: null,

            status: 'creating',

            shrinkmeUrl: '',

            destinationUrl,

            type: 'free',

            durationHours: 12

        };


        console.log(
            '🆕 New Free Key:',
            key
        );

        console.log(
            '🆔 requestId:',
            requestId
        );

        console.log(
            '⏰ expiresAt:',
            new Date(expiresAt).toISOString()
        );


        /*
          Save main record
        */

        await database
            .ref(`hrry_free_keys/${requestId}`)
            .set(record);


        /*
          Key index
        */

        await database
            .ref(`hrry_free_key_index/${key}`)
            .set(requestId);


        /*
          Device index.
          Store request ID under device hash.
          This avoids overwriting the entire device node.
        */

        await database
            .ref(
                `hrry_free_device_index/${deviceIdHash}/${requestId}`
            )
            .set(true);


        console.log(
            '✅ Free Key record saved to Firebase'
        );


        /*
          Create ShrinkMe URL
        */

        const shrinkUrl =
            'https://shrinkme.io/api?' +
            'api=' +
            encodeURIComponent(SHRINKME_API_KEY) +
            '&url=' +
            encodeURIComponent(destinationUrl);


        console.log(
            '🌐 Calling ShrinkMe API...'
        );


        const shrinkResponse =
            await fetch(shrinkUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });


        const shrinkText =
            await shrinkResponse.text();


        let shrinkData = {};

        try {
            shrinkData =
                JSON.parse(shrinkText);
        } catch (error) {

            console.error(
                '❌ ShrinkMe returned non-JSON:',
                shrinkText.slice(0, 500)
            );

            throw new Error(
                'ShrinkMe returned invalid response.'
            );

        }


        console.log(
            'ShrinkMe status:',
            shrinkData.status
        );


        if (
            !shrinkResponse.ok ||
            shrinkData.status !== 'success' ||
            !shrinkData.shortenedUrl
        ) {

            console.error(
                '❌ ShrinkMe failed:',
                shrinkData
            );

            /*
              Remove incomplete record
            */

            await Promise.allSettled([

                database
                    .ref(`hrry_free_keys/${requestId}`)
                    .remove(),

                database
                    .ref(`hrry_free_key_index/${key}`)
                    .remove(),

                database
                    .ref(
                        `hrry_free_device_index/${deviceIdHash}/${requestId}`
                    )
                    .remove()

            ]);

            return res.status(502).json({
                ok: false,
                error:
                    'ShrinkMe link नहीं बन पाया।'
            });

        }


        const shrinkmeUrl =
            String(
                shrinkData.shortenedUrl
            ).trim();


        /*
          Update record as ready
        */

        await database
            .ref(`hrry_free_keys/${requestId}`)
            .update({

                shrinkmeUrl,

                status: 'ready'

            });


        console.log(
            '✅ ShrinkMe URL created:',
            shrinkmeUrl
        );

        console.log(
            '========================================'
        );


        return res.status(200).json({

            ok: true,

            requestId,

            key,

            shrinkmeUrl,

            expiresAt,

            durationHours: 12

        });


    } catch (error) {

        console.error(
            '❌ /api/free/start ERROR:'
        );

        console.error(error);


        return res.status(500).json({

            ok: false,

            error:
                error.message ||
                'Free Key start failed.'

        });

    }

});


/* =========================================================
   FREE KEY LANDING PAGE
========================================================= */

app.get(
    '/free/:requestId/:secretToken',
    async (req, res) => {

        console.log('\n========================================');
        console.log('➡️ GET /free/:requestId/:secretToken');
        console.log('========================================');

        try {

            const database =
                ensureDatabase();

            const requestId =
                cleanString(
                    req.params.requestId,
                    200
                );

            const secretToken =
                cleanString(
                    req.params.secretToken,
                    300
                );


            console.log(
                '🆔 requestId:',
                requestId
            );


            const snapshot =
                await database
                    .ref(
                        `hrry_free_keys/${requestId}`
                    )
                    .once('value');


            const record =
                snapshot.val();


            if (!record) {

                return res.status(404).send(
                    renderMessagePage(
                        '❌ Link Invalid',
                        'यह Free Key link मौजूद नहीं है।'
                    )
                );

            }


            if (
                String(record.secretToken) !==
                String(secretToken)
            ) {

                return res.status(403).send(
                    renderMessagePage(
                        '❌ Invalid Link',
                        'यह link valid नहीं है।'
                    )
                );

            }


            if (isExpired(record.expiresAt)) {

                return res.status(410).send(
                    renderMessagePage(
                        '⏰ Key Expired',
                        'यह Free Key 12 घंटे के बाद expire हो चुकी है।'
                    )
                );

            }


            if (record.used === true) {

                return res.status(409).send(
                    renderMessagePage(
                        '🔒 Key Already Redeemed',
                        'यह Free Key पहले ही redeem हो चुकी है।'
                    )
                );

            }


            if (!record.key) {

                return res.status(500).send(
                    renderMessagePage(
                        '❌ Key Error',
                        'Key उपलब्ध नहीं है।'
                    )
                );

            }


            return res.status(200).send(
                renderFreeKeyPage(record)
            );


        } catch (error) {

            console.error(
                '❌ /free landing ERROR:',
                error
            );

            return res.status(500).send(
                renderMessagePage(
                    '❌ Server Error',
                    'Free Key page अभी उपलब्ध नहीं है।'
                )
            );

        }

    }
);


/* =========================================================
   REDEEM FREE KEY
========================================================= */

app.post('/api/free/redeem', async (req, res) => {

    console.log('\n========================================');
    console.log('➡️ POST /api/free/redeem');
    console.log('========================================');

    try {

        const database =
            ensureDatabase();


        const key =
            normalizeKey(
                req.body?.key
            );

        const deviceId =
            cleanString(
                req.body?.deviceId,
                300
            );


        console.log(
            '🔑 key received:',
            key || '(missing)'
        );

        console.log(
            '📱 deviceId received:',
            deviceId
                ? `${deviceId.slice(0, 12)}...`
                : '(missing)'
        );


        if (!key) {

            console.log(
                '❌ redeem rejected: key missing'
            );

            return res.status(400).json({

                ok: false,

                error:
                    'Free Key नहीं मिली।'

            });

        }


        if (!deviceId) {

            console.log(
                '❌ redeem rejected: deviceId missing'
            );

            return res.status(400).json({

                ok: false,

                error:
                    'Device ID नहीं मिली।'

            });

        }


        if (
            !key.startsWith('HRRY-FREE-')
        ) {

            console.log(
                '❌ redeem rejected: invalid key format'
            );

            return res.status(400).json({

                ok: false,

                error:
                    'यह Free Key format valid नहीं है।'

            });

        }


        const deviceIdHash =
            hashDeviceId(deviceId);


        /*
          First find requestId from key index.
        */

        const indexSnapshot =
            await database
                .ref(
                    `hrry_free_key_index/${key}`
                )
                .once('value');


        const requestId =
            indexSnapshot.val();


        console.log(
            '🆔 requestId from key index:',
            requestId || '(not found)'
        );


        if (!requestId) {

            console.log(
                '❌ redeem rejected: key not found'
            );

            return res.status(404).json({

                ok: false,

                error:
                    'यह Free Key valid नहीं है।'

            });

        }


        const keyRef =
            database.ref(
                `hrry_free_keys/${requestId}`
            );


        /*
          Read current record first.
          This gives a useful exact error instead
          of one generic transaction error.
        */

        const beforeSnapshot =
            await keyRef.once('value');


        const beforeRecord =
            beforeSnapshot.val();


        if (!beforeRecord) {

            console.log(
                '❌ redeem rejected: database record missing'
            );

            return res.status(404).json({

                ok: false,

                error:
                    'Free Key का database record नहीं मिला।'

            });

        }


        /*
          Device check
        */

        if (
            String(beforeRecord.deviceIdHash || '') !==
            String(deviceIdHash)
        ) {

            console.log(
                '❌ DEVICE MISMATCH'
            );

            console.log(
                'Stored device hash:',
                String(
                    beforeRecord.deviceIdHash || ''
                ).slice(0, 12) + '...'
            );

            console.log(
                'Received device hash:',
                String(
                    deviceIdHash
                ).slice(0, 12) + '...'
            );


            return res.status(403).json({

                ok: false,

                error:
                    'यह Free Key दूसरे device से linked है। उसी device/browser से redeem करें जिससे key बनाई गई थी।'

            });

        }


        /*
          Expiration
        */

        if (
            isExpired(
                beforeRecord.expiresAt
            )
        ) {

            console.log(
                '❌ redeem rejected: expired'
            );

            return res.status(410).json({

                ok: false,

                error:
                    'यह Free Key expire हो चुकी है।'

            });

        }


        /*
          Already redeemed
        */

        if (
            beforeRecord.used === true
        ) {

            console.log(
                '❌ redeem rejected: already used'
            );

            return res.status(409).json({

                ok: false,

                error:
                    'Free Key पहले ही redeem हो चुकी है।'

            });

        }


        /*
          Atomic transaction.
          This prevents two simultaneous requests
          from redeeming the same key.
        */

        const redeemedAt =
            Date.now();


        const transactionResult =
            await keyRef.transaction(
                current => {

                    if (!current) {
                        return;
                    }

                    if (
                        current.used === true
                    ) {
                        return;
                    }

                    if (
                        String(
                            current.deviceIdHash || ''
                        ) !==
                        String(deviceIdHash)
                    ) {
                        return;
                    }

                    if (
                        Number(
                            current.expiresAt || 0
                        ) <= Date.now()
                    ) {
                        return;
                    }


                    return {

                        ...current,

                        used: true,

                        usedAt: redeemedAt,

                        redeemedAt: redeemedAt,

                        /*
                          IMPORTANT:
                          status remains active because
                          access continues until expiresAt.
                        */

                        status: 'active'

                    };

                }
            );


        if (
            !transactionResult.committed
        ) {

            console.log(
                '❌ transaction not committed'
            );


            /*
              Re-read record to give exact reason.
            */

            const latestSnapshot =
                await keyRef.once('value');

            const latest =
                latestSnapshot.val();


            if (!latest) {

                return res.status(404).json({

                    ok: false,

                    error:
                        'Free Key record नहीं मिला।'

                });

            }


            if (
                String(
                    latest.deviceIdHash || ''
                ) !==
                String(deviceIdHash)
            ) {

                return res.status(403).json({

                    ok: false,

                    error:
                        'यह Free Key दूसरे device से linked है।'

                });

            }


            if (
                isExpired(
                    latest.expiresAt
                )
            ) {

                return res.status(410).json({

                    ok: false,

                    error:
                        'यह Free Key expire हो चुकी है।'

                });

            }


            if (
                latest.used === true
            ) {

                return res.status(409).json({

                    ok: false,

                    error:
                        'Free Key पहले ही redeem हो चुकी है।'

                });

            }


            return res.status(409).json({

                ok: false,

                error:
                    'Free Key redeem नहीं हो सकी। दोबारा कोशिश करें।'

            });

        }


        const finalRecord =
            transactionResult.snapshot.val();


        console.log(
            '✅ FREE KEY REDEEMED SUCCESSFULLY'
        );

        console.log(
            '🔑 key:',
            key
        );

        console.log(
            '⏰ expires:',
            new Date(
                finalRecord.expiresAt
            ).toISOString()
        );

        console.log(
            '========================================'
        );


        return res.status(200).json({

            ok: true,

            key: finalRecord.key,

            expiresAt:
                Number(
                    finalRecord.expiresAt
                ),

            durationHours: 12,

            status: 'active',

            message:
                'Free Key successfully activated.'

        });


    } catch (error) {

        console.error(
            '❌ /api/free/redeem ERROR:'
        );

        console.error(error);


        return res.status(500).json({

            ok: false,

            error:
                error.message ||
                'Free Key redeem नहीं हो सकी।'

        });

    }

});


/* =========================================================
   FREE ACCESS STATUS
========================================================= */

app.post('/api/free/status', async (req, res) => {

    console.log('\n========================================');
    console.log('➡️ POST /api/free/status');
    console.log('========================================');

    try {

        const database =
            ensureDatabase();


        const deviceId =
            cleanString(
                req.body?.deviceId,
                300
            );


        if (!deviceId) {

            return res.status(400).json({

                ok: false,

                active: false,

                error:
                    'deviceId is required.'

            });

        }


        const deviceIdHash =
            hashDeviceId(deviceId);


        /*
          Read all keys generated for this device.
        */

        const deviceIndexSnapshot =
            await database
                .ref(
                    `hrry_free_device_index/${deviceIdHash}`
                )
                .once('value');


        const deviceIndex =
            deviceIndexSnapshot.val();


        if (!deviceIndex) {

            console.log(
                'ℹ️ No Free Key found for this device.'
            );

            return res.status(200).json({

                ok: true,

                active: false

            });

        }


        let requestIds = [];


        /*
          New format:
          {
            requestId1: true,
            requestId2: true
          }
        */

        if (
            typeof deviceIndex === 'object' &&
            !Array.isArray(deviceIndex)
        ) {

            requestIds =
                Object.keys(deviceIndex);

        }


        /*
          Backward compatibility with old format:
          device index directly contained requestId
        */

        if (
            typeof deviceIndex === 'string'
        ) {

            requestIds = [
                deviceIndex
            ];

        }


        /*
          Newest first
        */

        requestIds.reverse();


        for (
            const requestId of requestIds
        ) {

            const snapshot =
                await database
                    .ref(
                        `hrry_free_keys/${requestId}`
                    )
                    .once('value');


            const record =
                snapshot.val();


            if (!record) {
                continue;
            }


            if (
                String(
                    record.deviceIdHash || ''
                ) !==
                String(deviceIdHash)
            ) {
                continue;
            }


            /*
              IMPORTANT:
              used=true DOES NOT mean access is over.
              It means the key has been redeemed.
              Access remains active until expiresAt.
            */

            if (
                record.used === true &&
                !isExpired(record.expiresAt)
            ) {

                console.log(
                    '✅ Active Free Access found:',
                    requestId
                );

                return res.status(200).json({

                    ok: true,

                    active: true,

                    key: record.key,

                    expiresAt:
                        Number(
                            record.expiresAt
                        ),

                    durationHours: 12

                });

            }

        }


        console.log(
            'ℹ️ No active Free Access.'
        );


        return res.status(200).json({

            ok: true,

            active: false

        });


    } catch (error) {

        console.error(
            '❌ /api/free/status ERROR:',
            error
        );


        return res.status(500).json({

            ok: false,

            active: false,

            error:
                error.message ||
                'Free access status check failed.'

        });

    }

});


/* =========================================================
   FREE KEY HTML PAGE
========================================================= */

function renderFreeKeyPage(record) {

    const safeKey =
        escapeHtml(record.key);

    const safeExpiry =
        escapeHtml(
            new Date(
                Number(record.expiresAt)
            ).toLocaleString(
                'en-IN',
                {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }
            )
        );

    const safeWebsite =
        escapeHtml(WEBSITE_URL);


    return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
>

<title>HRRY.TEST — Free Key</title>

<style>

* {
    box-sizing: border-box;
}

body {

    margin: 0;

    min-height: 100vh;

    display: flex;

    align-items: center;

    justify-content: center;

    padding: 20px;

    background:
        radial-gradient(
            circle at top,
            #20234a,
            #070811 65%
        );

    color: white;

    font-family:
        Arial,
        sans-serif;

}

.box {

    width: 100%;

    max-width: 430px;

    padding: 28px;

    border-radius: 28px;

    background:
        rgba(25, 28, 48, 0.92);

    border:
        1px solid
        rgba(255,255,255,0.12);

    box-shadow:
        0 25px 80px
        rgba(0,0,0,0.5);

    text-align: center;

}

.icon {

    font-size: 58px;

    margin-bottom: 12px;

}

h1 {

    margin: 0 0 8px;

    font-size: 27px;

}

.subtitle {

    color: #aeb3c7;

    line-height: 1.5;

    margin-bottom: 22px;

}

.key {

    padding: 18px 14px;

    border-radius: 16px;

    background:
        rgba(99,102,241,0.15);

    border:
        1px solid
        rgba(129,140,248,0.45);

    font-size: 22px;

    font-weight: 800;

    letter-spacing: 1px;

    word-break: break-all;

    margin: 15px 0;

}

button {

    width: 100%;

    border: 0;

    border-radius: 15px;

    padding: 15px;

    font-size: 16px;

    font-weight: 800;

    cursor: pointer;

    margin-top: 10px;

}

.copy {

    background:
        linear-gradient(
            135deg,
            #6366f1,
            #8b5cf6
        );

    color: white;

}

.back {

    display: none;

    background:
        rgba(16,185,129,0.18);

    border:
        1px solid
        rgba(16,185,129,0.5);

    color: #d1fae5;

}

.info {

    margin-top: 18px;

    color: #aeb3c7;

    font-size: 13px;

    line-height: 1.6;

}

.success {

    display: none;

    margin-top: 12px;

    color: #86efac;

    font-weight: 700;

}

</style>

</head>

<body>

<div class="box">

    <div class="icon">🎁🔑</div>

    <h1>Free Key Ready</h1>

    <div class="subtitle">
        तुम्हारी 12-hour Free Key तैयार है।
    </div>

    <div class="key" id="freeKey">
        ${safeKey}
    </div>

    <button
        class="copy"
        id="copyButton"
        onclick="copyKey()"
    >
        📋 Copy Free Key
    </button>

    <div
        class="success"
        id="copySuccess"
    >
        ✅ Key copied successfully
    </div>

    <button
        class="back"
        id="backButton"
        onclick="goBack()"
    >
        ↩️ Back to HRRY.TEST
    </button>

    <div class="info">

        ⏰ Valid for 12 hours<br>

        📱 Key उसी device पर redeem होगी
        जिससे request बनाई गई थी।

    </div>

</div>


<script>

const WEBSITE_URL =
    ${JSON.stringify(WEBSITE_URL)};


async function copyKey() {

    const key =
        document.getElementById(
            'freeKey'
        ).innerText.trim();

    let copied = false;


    try {

        await navigator.clipboard.writeText(
            key
        );

        copied = true;

    } catch (error) {

        try {

            const textarea =
                document.createElement('textarea');

            textarea.value = key;

            textarea.style.position =
                'fixed';

            textarea.style.opacity =
                '0';

            document.body.appendChild(
                textarea
            );

            textarea.focus();

            textarea.select();

            copied =
                document.execCommand('copy');

            textarea.remove();

        } catch (fallbackError) {

            copied = false;

        }

    }


    if (copied) {

        document.getElementById(
            'copySuccess'
        ).style.display = 'block';

        document.getElementById(
            'copyButton'
        ).innerText =
            '✅ Key Copied';

        document.getElementById(
            'backButton'
        ).style.display = 'block';

    } else {

        alert(
            'Key copy नहीं हो पाई। Key को manually copy करें।'
        );

    }

}


function goBack() {

    window.location.href =
        WEBSITE_URL;

}

</script>

</body>

</html>`;

}


/* =========================================================
   GENERIC MESSAGE PAGE
========================================================= */

function renderMessagePage(title, message) {

    return `<!DOCTYPE html>

<html lang="hi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>HRRY.TEST</title>

<style>

body {

    margin: 0;

    min-height: 100vh;

    display: flex;

    align-items: center;

    justify-content: center;

    padding: 20px;

    background: #080912;

    color: white;

    font-family: Arial, sans-serif;

}

.box {

    width: 100%;

    max-width: 430px;

    padding: 30px;

    border-radius: 25px;

    background: #171927;

    border: 1px solid #30334a;

    text-align: center;

}

h1 {

    font-size: 25px;

}

p {

    color: #b8bdd0;

    line-height: 1.6;

}

a {

    display: block;

    margin-top: 22px;

    padding: 14px;

    border-radius: 14px;

    background: #6366f1;

    color: white;

    text-decoration: none;

    font-weight: 800;

}

</style>

</head>

<body>

<div class="box">

<h1>${escapeHtml(title)}</h1>

<p>${escapeHtml(message)}</p>

<a href="${escapeHtml(WEBSITE_URL)}">
    ↩️ Back to HRRY.TEST
</a>

</div>

</body>

</html>`;

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

}


/* =========================================================
   404
========================================================= */

app.use((req, res) => {

    res.status(404).json({

        ok: false,

        error:
            'Endpoint not found.',

        path:
            req.path

    });

});


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (error, req, res, next) => {

        console.error(
            '❌ GLOBAL ERROR:',
            error
        );

        if (
            error.message ===
            'Not allowed by CORS'
        ) {

            return res.status(403).json({

                ok: false,

                error:
                    'CORS origin not allowed.'

            });

        }


        return res.status(500).json({

            ok: false,

            error:
                error.message ||
                'Internal server error.'

        });

    }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log('');
        console.log(
            '========================================'
        );

        console.log(
            '🚀 HRRY.TEST Free Key Backend Started'
        );

        console.log(
            '========================================'
        );

        console.log(
            'PORT:',
            PORT
        );

        console.log(
            'BACKEND_URL:',
            BACKEND_URL
        );

        console.log(
            'WEBSITE_URL:',
            WEBSITE_URL
        );

        console.log(
            'Firebase:',
            firebaseReady
                ? 'CONNECTED'
                : 'NOT CONNECTED'
        );

        console.log(
            '========================================'
        );

    }
);
