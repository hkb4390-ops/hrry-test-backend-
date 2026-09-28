const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const app = express();

app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json({
    limit: '100kb'
}));

const PORT = process.env.PORT || 8080;

const BACKEND_URL = (
    process.env.BACKEND_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://hrry-test-backend.onrender.com'
).replace(/\/$/, '');

const WEBSITE_URL = (
    process.env.WEBSITE_URL || ''
).replace(/\/$/, '');

const SHRINKME_API_KEY =
    process.env.SHRINKME_API_KEY || '';

const FIREBASE_DB_URL = (
    process.env.FIREBASE_DB_URL ||
    'https://hyuuu-732f9-default-rtdb.firebaseio.com'
).replace(/\/$/, '');

const SERVICE_ACCOUNT_RAW =
    process.env.FIREBASE_SERVICE_ACCOUNT || '';

const FREE_HOURS = 12;

if (!SHRINKME_API_KEY) {
    console.warn(
        'WARNING: SHRINKME_API_KEY is missing.'
    );
}

if (!SERVICE_ACCOUNT_RAW) {
    console.warn(
        'WARNING: FIREBASE_SERVICE_ACCOUNT is missing.'
    );
}

let db = null;


/* =========================================
   FIREBASE ADMIN INITIALIZATION
========================================= */

try {

    if (!SERVICE_ACCOUNT_RAW) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT environment variable is missing.'
        );
    }

    const serviceAccount =
        JSON.parse(SERVICE_ACCOUNT_RAW);

    if (
        !serviceAccount.project_id ||
        !serviceAccount.client_email ||
        !serviceAccount.private_key
    ) {
        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT is not a complete Service Account JSON.'
        );
    }

    if (getApps().length === 0) {

        initializeApp({
            credential: cert(serviceAccount),
            databaseURL: FIREBASE_DB_URL
        });

    }

    db = getDatabase();

    console.log(
        'Firebase Realtime Database initialized.'
    );

} catch (error) {

    console.error(
        'Firebase initialization failed:',
        error.message
    );

}


/* =========================================
   DATABASE CHECK
========================================= */

function requireDatabase(res) {

    if (!db) {

        res.status(503).json({
            ok: false,
            error:
                'Firebase server is not configured correctly.'
        });

        return false;
    }

    return true;
}


/* =========================================
   HELPERS
========================================= */

function normalizeDeviceId(value) {

    return String(value || '')
        .trim()
        .slice(0, 200);

}


function safeKey(value) {

    return String(value || '')
        .trim()
        .toUpperCase();

}


function deviceHash(deviceId) {

    return crypto
        .createHash('sha256')
        .update(deviceId)
        .digest('hex');

}


function randomToken(bytes = 18) {

    return crypto
        .randomBytes(bytes)
        .toString('hex');

}


function randomKey() {

    const a =
        crypto
            .randomBytes(4)
            .toString('hex')
            .toUpperCase();

    const b =
        crypto
            .randomBytes(3)
            .toString('hex')
            .toUpperCase();

    return `HRRY-FREE-${a}-${b}`;

}


function escapeHtml(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

}


/* =========================================
   FIREBASE PATHS
========================================= */

function getFreeKeyRef(requestId) {

    return db.ref(
        `hrry_free_keys/${requestId}`
    );

}


function getKeyIndexRef(key) {

    return db.ref(
        `hrry_free_key_index/${encodeURIComponent(key)}`
    );

}


function getDeviceIndexRef(deviceId) {

    return db.ref(
        `hrry_free_device_index/${deviceHash(deviceId)}`
    );

}


/* =========================================
   SHRINKME
========================================= */

async function createShrinkMeUrl(
    destinationUrl
) {

    if (!SHRINKME_API_KEY) {

        throw new Error(
            'SHRINKME_API_KEY is not configured.'
        );

    }

    const url =
        new URL(
            'https://shrinkme.io/api'
        );

    url.searchParams.set(
        'api',
        SHRINKME_API_KEY
    );

    url.searchParams.set(
        'url',
        destinationUrl
    );

    const response =
        await fetch(
            url,
            {
                method: 'GET',
                headers: {
                    'Accept':
                        'application/json,text/plain,*/*'
                }
            }
        );

    const text =
        await response.text();

    let data = null;

    try {
        data = JSON.parse(text);
    } catch (_) {}


    if (!response.ok) {

        throw new Error(
            `ShrinkMe HTTP ${response.status}`
        );

    }


    const shortenedUrl =
        data?.shortenedUrl ||
        data?.shortened_url ||
        (
            data?.status === 'success'
                ? data?.url
                : null
        );


    if (!shortenedUrl) {

        throw new Error(
            `ShrinkMe did not return shortenedUrl: ${text.slice(0, 300)}`
        );

    }


    return shortenedUrl;

}


/* =========================================
   HEALTH
========================================= */

app.get('/', (_req, res) => {

    res.json({

        ok: true,

        service:
            'hrry.test Free Key Backend',

        freeKeyDurationHours:
            FREE_HOURS,

        firebase:
            !!db,

        shrinkme:
            !!SHRINKME_API_KEY

    });

});


app.get('/health', (_req, res) => {

    res.json({

        ok: true,

        firebase:
            !!db,

        shrinkme:
            !!SHRINKME_API_KEY

    });

});


/* =========================================
   CREATE NEW FREE KEY
========================================= */

app.post(
    '/api/free/start',
    async (req, res) => {

        try {

            if (!requireDatabase(res)) {
                return;
            }


            const deviceId =
                normalizeDeviceId(
                    req.body?.deviceId
                );


            if (
                !deviceId ||
                deviceId.length < 8
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'Invalid deviceId.'

                });

            }


            const requestId =
                randomToken(16);

            const secretToken =
                randomToken(24);

            const key =
                randomKey();

            const now =
                Date.now();

            const expiresAt =
                now +
                FREE_HOURS *
                60 *
                60 *
                1000;


            const destinationUrl =
                `${BACKEND_URL}/free/${encodeURIComponent(requestId)}/${encodeURIComponent(secretToken)}`;


            const record = {

                type:
                    'free',

                durationHours:
                    FREE_HOURS,

                requestId,

                secretToken,

                key,

                deviceId,

                createdAt:
                    now,

                expiresAt,

                used:
                    false,

                usedAt:
                    null,

                status:
                    'created',

                shrinkmeUrl:
                    null,

                destinationUrl

            };


            await getFreeKeyRef(
                requestId
            ).set(record);


            await getKeyIndexRef(
                key
            ).set(requestId);


            let shrinkmeUrl;


            try {

                shrinkmeUrl =
                    await createShrinkMeUrl(
                        destinationUrl
                    );

            } catch (error) {

                await getKeyIndexRef(
                    key
                )
                    .remove()
                    .catch(() => {});


                await getFreeKeyRef(
                    requestId
                )
                    .remove()
                    .catch(() => {});


                throw error;

            }


            await getFreeKeyRef(
                requestId
            ).update({

                shrinkmeUrl,

                status:
                    'ready'

            });


            return res.json({

                ok: true,

                requestId,

                key,

                shrinkmeUrl,

                expiresAt,

                durationHours:
                    FREE_HOURS

            });


        } catch (error) {

            console.error(
                '/api/free/start:',
                error
            );

            return res.status(500).json({

                ok: false,

                error:
                    'Free key creation failed.'

            });

        }

    }
);


/* =========================================
   SHRINKME DESTINATION
   SAME LINK = SAME KEY
========================================= */

app.get(
    '/free/:requestId/:secretToken',
    async (req, res) => {

        try {

            if (!requireDatabase(res)) {
                return;
            }


            const requestId =
                String(
                    req.params.requestId || ''
                );

            const secretToken =
                String(
                    req.params.secretToken || ''
                );


            const snapshot =
                await getFreeKeyRef(
                    requestId
                ).get();


            const record =
                snapshot.val();


            if (
                !record ||
                record.secretToken !==
                    secretToken
            ) {

                return res
                    .status(404)
                    .send(
                        '<h2>Invalid free-key link.</h2>'
                    );

            }


            const expired =
                Date.now() >=
                Number(
                    record.expiresAt || 0
                );


            const remaining =
                Math.max(
                    0,
                    Number(
                        record.expiresAt || 0
                    ) -
                    Date.now()
                );


            const hours =
                Math.floor(
                    remaining /
                    3600000
                );


            const minutes =
                Math.floor(
                    (remaining %
                        3600000) /
                    60000
                );


            const statusText =
                expired

                    ? 'This 12-hour key has expired.'

                    : record.used

                        ? 'This key has already been redeemed on its bound device.'

                        : `Valid for about ${hours}h ${minutes}m.`;


            const siteButton =
                WEBSITE_URL

                    ? `<a href="${escapeHtml(WEBSITE_URL)}" class="site-btn">↩ Open hrry.test</a>`

                    : `<button class="site-btn" onclick="history.back()">↩ Go Back</button>`;


            res.setHeader(
                'Cache-Control',
                'no-store'
            );


            return res.send(`<!doctype html>

<html lang="en">

<head>

<meta charset="utf-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>
    hrry.test • Free Key
</title>

<style>

*{
    box-sizing:border-box
}

body{

    margin:0;

    min-height:100vh;

    display:grid;

    place-items:center;

    background:#07090e;

    color:#f8fafc;

    font-family:
        system-ui,
        -apple-system,
        Segoe UI,
        sans-serif;

    padding:20px;

}

.box{

    width:min(430px,100%);

    padding:28px;

    border:
        1px solid
        rgba(255,255,255,.12);

    border-radius:28px;

    background:
        rgba(18,24,38,.9);

    box-shadow:
        0 25px 70px
        rgba(0,0,0,.45);

    text-align:center;

}

.logo{

    font-size:38px;

}

.title{

    font-size:24px;

    font-weight:900;

    margin:8px 0;

}

.sub{

    color:#94a3b8;

    font-size:13px;

}

.key{

    margin:22px 0;

    padding:18px;

    border-radius:18px;

    background:
        rgba(99,102,241,.12);

    border:
        1px solid
        rgba(129,140,248,.35);

    font-size:23px;

    font-weight:900;

    letter-spacing:1px;

    word-break:break-all;

}

.status{

    font-size:13px;

    color:#cbd5e1;

    margin-bottom:18px;

}

.copy,
.site-btn{

    display:block;

    width:100%;

    border:0;

    border-radius:14px;

    padding:13px;

    margin-top:10px;

    text-decoration:none;

    font-weight:800;

    font-size:14px;

    cursor:pointer;

}

.copy{

    background:#6366f1;

    color:#fff;

}

.site-btn{

    background:#1f2937;

    color:#fff;

}

</style>

</head>

<body>

<main class="box">

<div class="logo">
    🎁
</div>

<div class="title">
    hrry.test Free Key
</div>

<div class="sub">
    12-hour access key
</div>

<div
    class="key"
    id="key"
>
    ${escapeHtml(record.key)}
</div>

<div class="status">
    ${escapeHtml(statusText)}
</div>

<button
    class="copy"
    onclick="navigator.clipboard?.writeText(document.getElementById('key').innerText).then(()=>this.innerText='✓ Copied')"
>
    📋 Copy Key
</button>

${siteButton}

</main>

</body>

</html>`);


        } catch (error) {

            console.error(
                '/free/:requestId/:secretToken:',
                error
            );

            return res
                .status(500)
                .send(
                    '<h2>Server error.</h2>'
                );

        }

    }
);


/* =========================================
   REDEEM FREE KEY
   ONE TIME ONLY
========================================= */

app.post(
    '/api/free/redeem',
    async (req, res) => {

        try {

            if (!requireDatabase(res)) {
                return;
            }


            const deviceId =
                normalizeDeviceId(
                    req.body?.deviceId
                );


            const key =
                safeKey(
                    req.body?.key
                );


            if (
                !deviceId ||
                !key
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'deviceId and key are required.'

                });

            }


            const indexSnapshot =
                await getKeyIndexRef(
                    key
                ).get();


            const requestId =
                indexSnapshot.val();


            if (!requestId) {

                return res.status(404).json({

                    ok: false,

                    error:
                        'Invalid free key.'

                });

            }


            const ref =
                getFreeKeyRef(
                    requestId
                );


            const transactionResult =
                await ref.transaction(
                    (record) => {

                        if (!record)
                            return;

                        if (
                            record.key !==
                            key
                        )
                            return;

                        if (
                            record.deviceId !==
                            deviceId
                        )
                            return;

                        if (
                            record.used ===
                            true
                        )
                            return;

                        if (
                            Date.now() >=
                            Number(
                                record.expiresAt ||
                                0
                            )
                        )
                            return;


                        return {

                            ...record,

                            used:
                                true,

                            usedAt:
                                Date.now(),

                            status:
                                'active'

                        };

                    }
                );


            if (
                !transactionResult.committed
            ) {

                const latest =
                    (
                        await ref.get()
                    ).val();


                if (!latest) {

                    return res.status(404).json({

                        ok: false,

                        error:
                            'Invalid free key.'

                    });

                }


                if (
                    latest.deviceId !==
                    deviceId
                ) {

                    return res.status(403).json({

                        ok: false,

                        error:
                            'This key belongs to another device.'

                    });

                }


                if (
                    latest.used ===
                    true
                ) {

                    return res.status(409).json({

                        ok: false,

                        error:
                            'This free key has already been used.'

                    });

                }


                if (
                    Date.now() >=
                    Number(
                        latest.expiresAt ||
                        0
                    )
                ) {

                    return res.status(410).json({

                        ok: false,

                        error:
                            'This free key has expired.'

                    });

                }


                return res.status(409).json({

                    ok: false,

                    error:
                        'Key could not be redeemed. Try again.'

                });

            }


            const record =
                transactionResult
                    .snapshot
                    .val();


            await getDeviceIndexRef(
                deviceId
            ).set(requestId);


            return res.json({

                ok: true,

                key:
                    record.key,

                expiresAt:
                    record.expiresAt,

                durationHours:
                    FREE_HOURS

            });


        } catch (error) {

            console.error(
                '/api/free/redeem:',
                error
            );

            return res.status(500).json({

                ok: false,

                error:
                    'Free key redemption failed.'

            });

        }

    }
);


/* =========================================
   SERVER-SIDE FREE ACCESS STATUS
========================================= */

app.post(
    '/api/free/status',
    async (req, res) => {

        try {

            if (!requireDatabase(res)) {
                return;
            }


            const deviceId =
                normalizeDeviceId(
                    req.body?.deviceId
                );


            if (!deviceId) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'deviceId is required.'

                });

            }


            const deviceIndex =
                await getDeviceIndexRef(
                    deviceId
                ).get();


            const requestId =
                deviceIndex.val();


            if (!requestId) {

                return res.json({

                    ok: true,

                    active: false

                });

            }


            const snapshot =
                await getFreeKeyRef(
                    requestId
                ).get();


            const record =
                snapshot.val();


            if (
                !record ||
                record.deviceId !==
                    deviceId ||
                record.used !== true
            ) {

                return res.json({

                    ok: true,

                    active: false

                });

            }


            const expiresAt =
                Number(
                    record.expiresAt || 0
                );


            if (
                Date.now() >=
                expiresAt
            ) {

                return res.json({

                    ok: true,

                    active: false,

                    expired: true,

                    expiresAt

                });

            }


            return res.json({

                ok: true,

                active: true,

                key:
                    record.key,

                expiresAt,

                durationHours:
                    FREE_HOURS

            });


        } catch (error) {

            console.error(
                '/api/free/status:',
                error
            );

            return res.status(500).json({

                ok: false,

                error:
                    'Status check failed.'

            });

        }

    }
);


/* =========================================
   START SERVER
========================================= */

app.listen(
    PORT,
    () => {

        console.log(
            `hrry.test Free Key backend listening on port ${PORT}`
        );

        console.log(
            `BACKEND_URL: ${BACKEND_URL}`
        );

        console.log(
            `WEBSITE_URL: ${
                WEBSITE_URL ||
                '(not set)'
            }`
        );

    }
);
