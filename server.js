'use strict';

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const admin = require('firebase-admin');
const {
    getDatabase
} = require('firebase-admin/database');

const app = express();

const PORT = Number(process.env.PORT || 10000);

const BACKEND_URL =
    (process.env.BACKEND_URL || '').replace(/\/+$/, '');

const WEBSITE_URL =
    (process.env.WEBSITE_URL || '').replace(/\/+$/, '');

const SHRINKME_API_KEY =
    process.env.SHRINKME_API_KEY || '';

const FIREBASE_DB_URL =
    process.env.FIREBASE_DB_URL || '';

const FIREBASE_SERVICE_ACCOUNT =
    process.env.FIREBASE_SERVICE_ACCOUNT || '';

/* =========================================================
   BASIC VALIDATION
========================================================= */

if (!BACKEND_URL) {
    console.error('❌ BACKEND_URL missing');
}

if (!WEBSITE_URL) {
    console.error('❌ WEBSITE_URL missing');
}

if (!SHRINKME_API_KEY) {
    console.error('❌ SHRINKME_API_KEY missing');
}

if (!FIREBASE_DB_URL) {
    console.error('❌ FIREBASE_DB_URL missing');
}

if (!FIREBASE_SERVICE_ACCOUNT) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT missing');
}


/* =========================================================
   CORS
========================================================= */

const allowedOrigins = new Set([
    'https://hrrr-test-free.vercel.app',
    'https://www.hrrr-test-free.vercel.app'
]);

app.use(
    cors({
        origin: function (origin, callback) {

            /*
             * Browser requests normally contain Origin.
             * Server-to-server / health requests may not.
             */
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.has(origin)) {
                return callback(null, true);
            }

            /*
             * Allow Vercel preview deployments too.
             */
            if (
                /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
            ) {
                return callback(null, true);
            }

            return callback(
                new Error('CORS origin not allowed')
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

        maxAge: 86400
    })
);

app.use(express.json({
    limit: '100kb'
}));

app.use(express.urlencoded({
    extended: false,
    limit: '100kb'
}));


/* =========================================================
   FIREBASE ADMIN
========================================================= */

let db;

try {

    const serviceAccount =
        JSON.parse(FIREBASE_SERVICE_ACCOUNT);

    if (!admin.apps.length) {

        admin.initializeApp({
            credential: admin.credential.cert(
                serviceAccount
            ),

            databaseURL: FIREBASE_DB_URL
        });
    }

    db = getDatabase();

    console.log(
        '✅ Firebase Admin initialized'
    );

} catch (error) {

    console.error(
        '❌ Firebase initialization failed:',
        error.message
    );
}


/* =========================================================
   HELPERS
========================================================= */

function createRandomString(length = 32) {

    return crypto
        .randomBytes(Math.ceil(length * 0.75))
        .toString('base64url')
        .slice(0, length);
}


function createFreeKey() {

    const randomPart =
        crypto
            .randomBytes(9)
            .toString('hex')
            .toUpperCase();

    return `HRRY-FREE-${randomPart}`;
}


function hashValue(value) {

    return crypto
        .createHash('sha256')
        .update(String(value))
        .digest('hex');
}


function normalizeDeviceId(deviceId) {

    return String(deviceId || '')
        .trim()
        .slice(0, 300);
}


function now() {

    return Date.now();
}


function isValidHttpUrl(value) {

    try {

        const url = new URL(value);

        return (
            url.protocol === 'https:' ||
            url.protocol === 'http:'
        );

    } catch {

        return false;
    }
}


/* =========================================================
   FIREBASE CHECK
========================================================= */

function ensureDatabase() {

    if (!db) {

        throw new Error(
            'Firebase database is not initialized.'
        );
    }
}


/* =========================================================
   HEALTH
========================================================= */

app.get('/', (req, res) => {

    res.status(200).json({

        ok: true,

        service:
            'hrry.test Free Key Backend',

        website:
            WEBSITE_URL || null,

        time:
            new Date().toISOString()
    });
});


app.get('/health', (req, res) => {

    res.status(200).json({

        ok: true,

        firebase:
            Boolean(db),

        time:
            new Date().toISOString()
    });
});


/* =========================================================
   CREATE FREE KEY
========================================================= */

app.post(
    '/api/free/start',
    async (req, res) => {

        try {

            ensureDatabase();

            if (!SHRINKME_API_KEY) {

                return res.status(500).json({

                    ok: false,

                    error:
                        'ShrinkMe API key is not configured.'
                });
            }

            const deviceId =
                normalizeDeviceId(
                    req.body?.deviceId
                );

            if (!deviceId) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'Device ID missing.'
                });
            }


            /*
             * Unique request.
             */
            const requestId =
                createRandomString(24);


            /*
             * Secret token protects the destination URL.
             */
            const secretToken =
                createRandomString(48);


            /*
             * 12 hours.
             */
            const createdAt =
                now();

            const expiresAt =
                createdAt +
                (12 * 60 * 60 * 1000);


            /*
             * Unique Free Key.
             */
            const key =
                createFreeKey();


            /*
             * Destination after ShrinkMe.
             */
            const destinationUrl =
                `${BACKEND_URL}/free/${requestId}/${secretToken}`;


            if (
                !isValidHttpUrl(
                    destinationUrl
                )
            ) {

                throw new Error(
                    'Invalid backend destination URL.'
                );
            }


            /*
             * Save initial record first.
             */
            const record = {

                key,

                deviceIdHash:
                    hashValue(deviceId),

                secretToken,

                createdAt,

                expiresAt,

                used: false,

                usedAt: null,

                status: 'active',

                shrinkmeUrl: '',

                destinationUrl,

                type: 'free',

                durationHours: 12
            };


            await db
                .ref(
                    `hrry_free_keys/${requestId}`
                )
                .set(record);


            /*
             * Index key -> requestId
             */
            await db
                .ref(
                    `hrry_free_key_index/${key}`
                )
                .set(requestId);


            /*
             * Index latest request for device.
             */
            await db
                .ref(
                    `hrry_free_device_index/${hashValue(deviceId)}`
                )
                .set(requestId);


            /*
             * ShrinkMe API
             */
            const shrinkMeUrl =
                new URL(
                    'https://shrinkme.io/api'
                );

            shrinkMeUrl.searchParams.set(
                'api',
                SHRINKME_API_KEY
            );

            shrinkMeUrl.searchParams.set(
                'url',
                destinationUrl
            );


            const shrinkResponse =
                await fetch(
                    shrinkMeUrl.toString(),
                    {
                        method: 'GET',

                        headers: {
                            'Accept':
                                'application/json'
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

            } catch {

                throw new Error(
                    'ShrinkMe returned invalid JSON.'
                );
            }


            if (
                !shrinkResponse.ok ||
                shrinkData.status !== 'success' ||
                !shrinkData.shortenedUrl
            ) {

                console.error(
                    'ShrinkMe error:',
                    shrinkData
                );

                throw new Error(
                    shrinkData.message ||
                    'ShrinkMe could not create the short link.'
                );
            }


            const shortenedUrl =
                String(
                    shrinkData.shortenedUrl
                );


            /*
             * Save shortened URL.
             */
            await db
                .ref(
                    `hrry_free_keys/${requestId}/shrinkmeUrl`
                )
                .set(shortenedUrl);


            console.log(
                `✅ Free key created: ${requestId}`
            );


            return res.status(200).json({

                ok: true,

                requestId,

                shrinkmeUrl:
                    shortenedUrl,

                expiresAt,

                durationHours: 12
            });

        } catch (error) {

            console.error(
                '❌ /api/free/start:',
                error
            );

            return res.status(500).json({

                ok: false,

                error:
                    error.message ||
                    'Free Key creation failed.'
            });
        }
    }
);


/* =========================================================
   FREE KEY LANDING PAGE
========================================================= */

app.get(
    '/free/:requestId/:secretToken',
    async (req, res) => {

        try {

            ensureDatabase();

            const {
                requestId,
                secretToken
            } = req.params;


            const snapshot =
                await db
                    .ref(
                        `hrry_free_keys/${requestId}`
                    )
                    .once('value');


            const record =
                snapshot.val();


            if (!record) {

                return res
                    .status(404)
                    .send(
                        createMessagePage(
                            'Free Key नहीं मिली',
                            'यह Free Key link valid नहीं है।',
                            false
                        )
                    );
            }


            if (
                record.secretToken !==
                secretToken
            ) {

                return res
                    .status(403)
                    .send(
                        createMessagePage(
                            'Invalid Link',
                            'यह link valid नहीं है।',
                            false
                        )
                    );
            }


            const expired =
                now() >=
                Number(record.expiresAt);


            if (expired) {

                return res
                    .status(410)
                    .send(
                        createMessagePage(
                            'Free Key Expired',
                            'यह 12-hour Free Key expire हो चुकी है।',
                            false
                        )
                    );
            }


            if (record.used) {

                return res
                    .status(410)
                    .send(
                        createMessagePage(
                            'Free Key Already Used',
                            'यह Free Key पहले ही redeem की जा चुकी है।',
                            false
                        )
                    );
            }


            const remaining =
                Math.max(
                    0,
                    Number(record.expiresAt) -
                    now()
                );


            return res
                .status(200)
                .send(
                    createKeyPage(
                        record.key,
                        remaining
                    )
                );

        } catch (error) {

            console.error(
                '❌ Free key landing error:',
                error
            );

            return res
                .status(500)
                .send(
                    createMessagePage(
                        'Server Error',
                        'Free Key page अभी उपलब्ध नहीं है।',
                        false
                    )
                );
        }
    }
);


/* =========================================================
   REDEEM FREE KEY
========================================================= */

app.post(
    '/api/free/redeem',
    async (req, res) => {

        try {

            ensureDatabase();

            const key =
                String(
                    req.body?.key || ''
                )
                    .trim()
                    .toUpperCase();

            const deviceId =
                normalizeDeviceId(
                    req.body?.deviceId
                );


            if (!key) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'Key missing.'
                });
            }


            if (!deviceId) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'Device ID missing.'
                });
            }


            if (
                !key.startsWith(
                    'HRRY-FREE-'
                )
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'यह Free Key नहीं है।'
                });
            }


            /*
             * Find request by key.
             */
            const indexSnapshot =
                await db
                    .ref(
                        `hrry_free_key_index/${key}`
                    )
                    .once('value');


            const requestId =
                indexSnapshot.val();


            if (!requestId) {

                return res.status(404).json({

                    ok: false,

                    error:
                        'Invalid Free Key.'
                });
            }


            const recordRef =
                db.ref(
                    `hrry_free_keys/${requestId}`
                );


            /*
             * Atomic transaction.
             *
             * This prevents two devices from successfully
             * redeeming the same key at the same time.
             */
            let transactionResult;

            transactionResult =
                await recordRef.transaction(
                    current => {

                        if (!current) {
                            return;
                        }


                        const currentTime =
                            now();


                        if (
                            current.used === true
                        ) {

                            return;
                        }


                        if (
                            current.key !== key
                        ) {

                            return;
                        }


                        if (
                            currentTime >=
                            Number(
                                current.expiresAt
                            )
                        ) {

                            return;
                        }


                        const expectedDeviceHash =
                            current.deviceIdHash;


                        const actualDeviceHash =
                            hashValue(
                                deviceId
                            );


                        /*
                         * Key is bound to the device
                         * that requested it.
                         */
                        if (
                            expectedDeviceHash !==
                            actualDeviceHash
                        ) {

                            return;
                        }


                        return {

                            ...current,

                            used: true,

                            usedAt:
                                currentTime,

                            status:
                                'used'
                        };
                    }
                );


            if (
                !transactionResult.committed
            ) {

                const latestSnapshot =
                    await recordRef.once(
                        'value'
                    );

                const latest =
                    latestSnapshot.val();


                if (!latest) {

                    return res.status(404).json({

                        ok: false,

                        error:
                            'Free Key नहीं मिली।'
                    });
                }


                if (latest.used) {

                    return res.status(409).json({

                        ok: false,

                        error:
                            'यह Free Key पहले ही इस्तेमाल हो चुकी है।'
                    });
                }


                if (
                    now() >=
                    Number(
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
                    latest.deviceIdHash !==
                    hashValue(deviceId)
                ) {

                    return res.status(403).json({

                        ok: false,

                        error:
                            'यह Free Key दूसरे device के लिए है।'
                    });
                }


                return res.status(409).json({

                    ok: false,

                    error:
                        'Free Key redeem नहीं हो सकी।'
                });
            }


            const finalSnapshot =
                await recordRef.once(
                    'value'
                );


            const finalRecord =
                finalSnapshot.val();


            return res.status(200).json({

                ok: true,

                key:
                    finalRecord.key,

                expiresAt:
                    Number(
                        finalRecord.expiresAt
                    ),

                durationHours: 12
            });

        } catch (error) {

            console.error(
                '❌ /api/free/redeem:',
                error
            );

            return res.status(500).json({

                ok: false,

                error:
                    error.message ||
                    'Free Key verification failed.'
            });
        }
    }
);


/* =========================================================
   CHECK FREE ACCESS
========================================================= */

app.post(
    '/api/free/status',
    async (req, res) => {

        try {

            ensureDatabase();

            const deviceId =
                normalizeDeviceId(
                    req.body?.deviceId
                );


            if (!deviceId) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'Device ID missing.'
                });
            }


            const deviceHash =
                hashValue(
                    deviceId
                );


            const indexSnapshot =
                await db
                    .ref(
                        `hrry_free_device_index/${deviceHash}`
                    )
                    .once('value');


            const requestId =
                indexSnapshot.val();


            if (!requestId) {

                return res.status(200).json({

                    ok: true,

                    active: false
                });
            }


            const recordSnapshot =
                await db
                    .ref(
                        `hrry_free_keys/${requestId}`
                    )
                    .once('value');


            const record =
                recordSnapshot.val();


            if (!record) {

                return res.status(200).json({

                    ok: true,

                    active: false
                });
            }


            const currentTime =
                now();


            const expiresAt =
                Number(
                    record.expiresAt
                );


            /*
             * Access is valid until expiration.
             */
            const active =
                record.used === true
                    ? false
                    : (
                        currentTime <
                        expiresAt
                    );


            if (!active) {

                return res.status(200).json({

                    ok: true,

                    active: false,

                    expired:
                        currentTime >=
                        expiresAt
                });
            }


            return res.status(200).json({

                ok: true,

                active: true,

                key:
                    record.key,

                expiresAt
            });

        } catch (error) {

            console.error(
                '❌ /api/free/status:',
                error
            );

            return res.status(500).json({

                ok: false,

                error:
                    'Free access status check failed.'
            });
        }
    }
);


/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
    (error, req, res, next) => {

        console.error(
            '❌ Server error:',
            error
        );

        if (
            error.message ===
            'CORS origin not allowed'
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
                'Internal server error.'
        });
    }
);


/* =========================================================
   HTML HELPERS
========================================================= */

function escapeHtml(value) {

    return String(value)
        .replace(
            /&/g,
            '&amp;'
        )
        .replace(
            /</g,
            '&lt;'
        )
        .replace(
            />/g,
            '&gt;'
        )
        .replace(
            /"/g,
            '&quot;'
        )
        .replace(
            /'/g,
            '&#039;'
        );
}


function formatRemaining(ms) {

    const totalSeconds =
        Math.floor(
            Math.max(0, ms) / 1000
        );

    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    return `${hours}h ${minutes}m`;
}


function createKeyPage(
    key,
    remainingMs
) {

    const safeKey =
        escapeHtml(key);

    const remaining =
        escapeHtml(
            formatRemaining(
                remainingMs
            )
        );

    const website =
        escapeHtml(
            WEBSITE_URL || '#'
        );


    return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
/>

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
    padding:20px;
    background:
        radial-gradient(
            circle at top,
            #18245c,
            #070914 60%
        );
    color:#fff;
    font-family:
        Arial,
        sans-serif;
}

.card{
    width:min(430px,100%);
    padding:28px;
    border-radius:26px;
    text-align:center;
    background:rgba(255,255,255,.08);
    border:1px solid rgba(255,255,255,.14);
    box-shadow:
        0 30px 80px rgba(0,0,0,.45);
    backdrop-filter:blur(25px);
}

.icon{
    font-size:48px;
    margin-bottom:12px;
}

h1{
    margin:0 0 8px;
    font-size:25px;
}

p{
    color:rgba(255,255,255,.68);
    line-height:1.5;
}

.key{
    margin:22px 0;
    padding:18px;
    border-radius:18px;
    background:rgba(99,102,241,.18);
    border:1px solid rgba(129,140,248,.35);
    font-size:20px;
    font-weight:900;
    letter-spacing:1.5px;
    word-break:break-all;
}

.time{
    margin-bottom:18px;
    color:#a5b4fc;
    font-weight:700;
}

button{
    width:100%;
    padding:14px;
    border:0;
    border-radius:14px;
    cursor:pointer;
    font-size:15px;
    font-weight:800;
    background:#6366f1;
    color:white;
}

a{
    display:block;
    margin-top:14px;
    color:#a5b4fc;
    text-decoration:none;
    font-size:13px;
}

</style>

</head>

<body>

<div class="card">

<div class="icon">🔑</div>

<h1>Your Free Test Key</h1>

<p>
Your 12-hour Free Key is ready.
</p>

<div
    class="key"
    id="key"
>${safeKey}</div>

<div class="time">
⏱ Approximately ${remaining} remaining
</div>

<button
    onclick="copyKey()"
>
Copy Free Key
</button>

<a href="${website}">
Return to hrrr.test
</a>

</div>

<script>

async function copyKey(){

    const key =
        document
            .getElementById('key')
            .innerText
            .trim();

    try{

        await navigator
            .clipboard
            .writeText(key);

        alert(
            'Free Key copied!'
        );

    }catch{

        alert(
            'Key: ' + key
        );
    }
}

</script>

</body>

</html>`;
}


function createMessagePage(
    title,
    message,
    success
) {

    const safeTitle =
        escapeHtml(title);

    const safeMessage =
        escapeHtml(message);

    const website =
        escapeHtml(
            WEBSITE_URL || '#'
        );


    return `<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
/>

<title>${safeTitle}</title>

<style>

body{
    margin:0;
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
    background:#070914;
    color:white;
    font-family:Arial,sans-serif;
}

.card{
    width:min(430px,100%);
    text-align:center;
    padding:30px;
    border-radius:25px;
    background:rgba(255,255,255,.08);
    border:1px solid rgba(255,255,255,.12);
}

.icon{
    font-size:50px;
    margin-bottom:15px;
}

h1{
    margin:0 0 12px;
}

p{
    color:rgba(255,255,255,.7);
    line-height:1.5;
}

a{
    display:inline-block;
    margin-top:18px;
    padding:13px 18px;
    border-radius:13px;
    background:#6366f1;
    color:white;
    text-decoration:none;
    font-weight:800;
}

</style>

</head>

<body>

<div class="card">

<div class="icon">
${success ? '🔑' : '⚠️'}
</div>

<h1>
${safeTitle}
</h1>

<p>
${safeMessage}
</p>

<a href="${website}">
Return to hrry.test
</a>

</div>

</body>

</html>`;
}


/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            `🚀 Server running on port ${PORT}`
        );

        console.log(
            `🌐 Backend: ${BACKEND_URL || '(not set)'}`
        );

        console.log(
            `🌐 Website: ${WEBSITE_URL || '(not set)'}`
        );

        console.log(
            `🔥 Firebase: ${db ? 'connected' : 'NOT CONNECTED'}`
        );
    }
);
