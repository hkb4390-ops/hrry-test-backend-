'use strict';

/*
============================================================
 HRRY.TEST — FREE KEY BACKEND
 FINAL CORRECTED VERSION
============================================================

 FRONTEND:
 https://hrrr-test-free.vercel.app

 BACKEND:
 https://hrry-test-backend.onrender.com

 FIREBASE:
 Realtime Database

 FREE KEY:
 12 Hours

============================================================
*/


/* =========================================================
   MODULES
========================================================= */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');


/* =========================================================
   EXPRESS APP
========================================================= */

const app = express();


/* =========================================================
   CONFIGURATION
========================================================= */

const PORT = Number(
    process.env.PORT || 10000
);


const BACKEND_URL = String(
    process.env.BACKEND_URL ||
    'https://hrry-test-backend.onrender.com'
)
    .trim()
    .replace(/\/+$/, '');


const WEBSITE_URL = String(
    process.env.WEBSITE_URL ||
    'https://hrrr-test-free.vercel.app'
)
    .trim()
    .replace(/\/+$/, '');


const FIREBASE_DB_URL = String(
    process.env.FIREBASE_DB_URL ||
    'https://hyuuu-732f9-default-rtdb.firebaseio.com'
)
    .trim()
    .replace(/\/+$/, '');


const SHRINKME_API_KEY = String(
    process.env.SHRINKME_API_KEY ||
    ''
).trim();


/*
  Free Key validity
*/

const FREE_KEY_DURATION_MS =
    12 * 60 * 60 * 1000;


/* =========================================================
   CORS
========================================================= */

const allowedOrigins = new Set([
    'https://hrrr-test-free.vercel.app',
    'https://www.hrrr-test-free.vercel.app'
]);


function isAllowedOrigin(origin) {

    /*
      Direct requests without Origin are allowed.
    */

    if (!origin) {
        return true;
    }


    /*
      Main website
    */

    if (
        allowedOrigins.has(origin)
    ) {
        return true;
    }


    /*
      Vercel preview URLs
    */

    if (
        /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/
            .test(origin)
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

                return;
            }


            console.log(
                '❌ CORS BLOCKED:',
                origin ||
                '(no origin)'
            );


            callback(
                new Error(
                    'Not allowed by CORS'
                )
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
   HELPER FUNCTIONS
========================================================= */


/*
  Clean string
*/

function cleanString(
    value,
    maxLength = 500
) {

    return String(
        value == null
            ? ''
            : value
    )
        .trim()
        .slice(
            0,
            maxLength
        );

}


/*
  Normalize Free Key
*/

function normalizeKey(
    value
) {

    return cleanString(
        value,
        100
    )
        .toUpperCase()
        .replace(
            /\s+/g,
            ''
        );

}


/*
  SHA-256 device hash
*/

function hashDeviceId(
    deviceId
) {

    return crypto
        .createHash(
            'sha256'
        )
        .update(
            String(
                deviceId
            ),
            'utf8'
        )
        .digest(
            'hex'
        );

}


/*
  Request ID
*/

function createRequestId() {

    return crypto
        .randomBytes(
            18
        )
        .toString(
            'hex'
        );

}


/*
  Secret token
*/

function createSecretToken() {

    return crypto
        .randomBytes(
            32
        )
        .toString(
            'hex'
        );

}


/*
  Free Key
*/

function createFreeKey() {

    return (
        'HRRY-FREE-' +
        crypto
            .randomBytes(
                8
            )
            .toString(
                'hex'
            )
            .toUpperCase()
    );

}


/*
  Expiration
*/

function isExpired(
    expiresAt
) {

    return (
        Number(
            expiresAt || 0
        ) <= Date.now()
    );

}


/*
  HTML escape
*/

function escapeHtml(
    value
) {

    return String(
        value == null
            ? ''
            : value
    )
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


/* =========================================================
   FIREBASE SERVICE ACCOUNT
========================================================= */

function getFirebaseServiceAccount() {

    const raw =
        process.env.FIREBASE_SERVICE_ACCOUNT;


    if (!raw) {

        throw new Error(
            'FIREBASE_SERVICE_ACCOUNT environment variable is missing.'
        );

    }


    let serviceAccount;


    try {

        serviceAccount =
            JSON.parse(
                raw
            );

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


    db =
        admin.database();


    firebaseReady =
        true;


    console.log('');
    console.log(
        '========================================'
    );

    console.log(
        '✅ FIREBASE CONNECTED'
    );

    console.log(
        'Project:',
        serviceAccount.project_id
    );

    console.log(
        'Database:',
        FIREBASE_DB_URL
    );

    console.log(
        '========================================'
    );

    console.log('');


} catch (error) {

    firebaseReady =
        false;

    db =
        null;


    console.error('');
    console.error(
        '========================================'
    );

    console.error(
        '❌ FIREBASE INITIALIZATION FAILED'
    );

    console.error(
        error.message
    );

    console.error(
        '========================================'
    );

    console.error('');

}


/* =========================================================
   DATABASE CHECK
========================================================= */

function ensureDatabase() {

    if (
        !firebaseReady ||
        !db
    ) {

        throw new Error(
            'Firebase database is not initialized.'
        );

    }


    return db;

}


/* =========================================================
   ROOT
========================================================= */

app.get(
    '/',
    (req, res) => {

        return res.status(200).json({

            ok: true,

            service:
                'HRRY.TEST Free Key Backend',

            frontend:
                WEBSITE_URL,

            backend:
                BACKEND_URL,

            firebase:
                firebaseReady,

            time:
                new Date().toISOString()

        });

    }
);


/* =========================================================
   HEALTH
========================================================= */

app.get(
    '/health',
    async (req, res) => {

        try {

            const database =
                ensureDatabase();


            /*
              Actual Firebase read
            */

            await database
                .ref(
                    '.info/connected'
                )
                .once(
                    'value'
                );


            return res.status(200).json({

                ok: true,

                firebase: true,

                time:
                    new Date().toISOString()

            });


        } catch (error) {

            console.error(
                '❌ HEALTH ERROR:',
                error
            );


            return res.status(503).json({

                ok: false,

                firebase: false,

                error:
                    error.message ||
                    'Firebase connection failed.',

                time:
                    new Date().toISOString()

            });

        }

    }
);


/* =========================================================
   START FREE KEY
========================================================= */

app.post(
    '/api/free/start',
    async (req, res) => {

        console.log('');
        console.log(
            '========================================'
        );

        console.log(
            '➡️ POST /api/free/start'
        );

        console.log(
            '========================================'
        );


        try {

            const database =
                ensureDatabase();


            const deviceId =
                cleanString(
                    req.body?.deviceId,
                    300
                );


            console.log(
                '📱 device:',
                deviceId
                    ? deviceId.slice(
                        0,
                        12
                    ) + '...'
                    : '(missing)'
            );


            if (!deviceId) {

                return res.status(400).json({

                    ok: false,

                    error:
                        'deviceId is required.'

                });

            }


            if (!SHRINKME_API_KEY) {

                return res.status(500).json({

                    ok: false,

                    error:
                        'ShrinkMe API key is not configured on server.'

                });

            }


            /*
              Time
            */

            const now =
                Date.now();


            /*
              Generate
            */

            const requestId =
                createRequestId();


            const secretToken =
                createSecretToken();


            const key =
                createFreeKey();


            const expiresAt =
                now +
                FREE_KEY_DURATION_MS;


            const deviceIdHash =
                hashDeviceId(
                    deviceId
                );


            /*
              Destination
            */

            const destinationUrl =
                `${BACKEND_URL}/free/${encodeURIComponent(requestId)}/${encodeURIComponent(secretToken)}`;


            /*
              Record
            */

            const record = {

                key,

                requestId,

                secretToken,

                deviceIdHash,

                createdAt:
                    now,

                expiresAt,

                used:
                    false,

                usedAt:
                    null,

                redeemedAt:
                    null,

                status:
                    'creating',

                shrinkmeUrl:
                    '',

                destinationUrl,

                type:
                    'free',

                durationHours:
                    12

            };


            console.log(
                '🆕 Free Key:',
                key
            );

            console.log(
                '🆔 Request:',
                requestId
            );


            /*
              Save main record
            */

            await database
                .ref(
                    `hrry_free_keys/${requestId}`
                )
                .set(
                    record
                );


            /*
              Key index
            */

            await database
                .ref(
                    `hrry_free_key_index/${key}`
                )
                .set(
                    requestId
                );


            /*
              Device index
            */

            await database
                .ref(
                    `hrry_free_device_index/${deviceIdHash}/${requestId}`
                )
                .set(
                    true
                );


            console.log(
                '✅ Firebase record created'
            );


            /* -------------------------------------------------
               SHRINKME
            ------------------------------------------------- */

            const shrinkUrl =
                'https://shrinkme.io/api?' +
                'api=' +
                encodeURIComponent(
                    SHRINKME_API_KEY
                ) +
                '&url=' +
                encodeURIComponent(
                    destinationUrl
                );


            console.log(
                '🌐 Calling ShrinkMe...'
            );


            const controller =
                new AbortController();


            const timeout =
                setTimeout(
                    () => {
                        controller.abort();
                    },
                    20000
                );


            let shrinkResponse;


            try {

                shrinkResponse =
                    await fetch(
                        shrinkUrl,
                        {

                            method:
                                'GET',

                            headers: {

                                Accept:
                                    'application/json'

                            },

                            signal:
                                controller.signal

                        }
                    );

            } finally {

                clearTimeout(
                    timeout
                );

            }


            const shrinkText =
                await shrinkResponse.text();


            let shrinkData = {};


            try {

                shrinkData =
                    JSON.parse(
                        shrinkText
                    );

            } catch (error) {

                console.error(
                    '❌ ShrinkMe invalid JSON:',
                    shrinkText.slice(
                        0,
                        500
                    )
                );


                throw new Error(
                    'ShrinkMe returned invalid response.'
                );

            }


            console.log(
                'ShrinkMe HTTP:',
                shrinkResponse.status
            );

            console.log(
                'ShrinkMe status:',
                shrinkData.status
            );


            if (
                !shrinkResponse.ok ||
                shrinkData.status !==
                    'success' ||
                !shrinkData.shortenedUrl
            ) {

                console.error(
                    '❌ ShrinkMe failed:',
                    shrinkData
                );


                await Promise.allSettled([

                    database
                        .ref(
                            `hrry_free_keys/${requestId}`
                        )
                        .remove(),

                    database
                        .ref(
                            `hrry_free_key_index/${key}`
                        )
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
              Mark ready
            */

            await database
                .ref(
                    `hrry_free_keys/${requestId}`
                )
                .update({

                    shrinkmeUrl,

                    status:
                        'ready'

                });


            console.log(
                '✅ ShrinkMe URL created'
            );


            return res.status(200).json({

                ok: true,

                requestId,

                key,

                shrinkmeUrl,

                expiresAt,

                durationHours:
                    12

            });


        } catch (error) {

            console.error('');
            console.error(
                '❌ /api/free/start ERROR'
            );

            console.error(
                error
            );

            console.error('');


            return res.status(500).json({

                ok: false,

                error:
                    error.message ||
                    'Free Key start failed.'

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

        console.log('');
        console.log(
            '➡️ GET /free/:requestId/:secretToken'
        );


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


            const snapshot =
                await database
                    .ref(
                        `hrry_free_keys/${requestId}`
                    )
                    .once(
                        'value'
                    );


            const record =
                snapshot.val();


            if (!record) {

                return res
                    .status(404)
                    .send(
                        renderMessagePage(
                            '❌ Link Invalid',
                            'यह Free Key link मौजूद नहीं है।'
                        )
                    );

            }


            /*
              Secret token
            */

            if (
                String(
                    record.secretToken
                ) !==
                String(
                    secretToken
                )
            ) {

                return res
                    .status(403)
                    .send(
                        renderMessagePage(
                            '❌ Invalid Link',
                            'यह link valid नहीं है।'
                        )
                    );

            }


            /*
              Expired
            */

            if (
                isExpired(
                    record.expiresAt
                )
            ) {

                return res
                    .status(410)
                    .send(
                        renderMessagePage(
                            '⏰ Key Expired',
                            'यह Free Key 12 घंटे के बाद expire हो चुकी है।'
                        )
                    );

            }


            /*
              Already used
            */

            if (
                record.used === true
            ) {

                return res
                    .status(409)
                    .send(
                        renderMessagePage(
                            '🔒 Key Already Redeemed',
                            'यह Free Key पहले ही redeem हो चुकी है।'
                        )
                    );

            }


            if (!record.key) {

                return res
                    .status(500)
                    .send(
                        renderMessagePage(
                            '❌ Key Error',
                            'Free Key उपलब्ध नहीं है।'
                        )
                    );

            }


            return res
                .status(200)
                .send(
                    renderFreeKeyPage(
                        record
                    )
                );


        } catch (error) {

            console.error(
                '❌ FREE PAGE ERROR:',
                error
            );


            return res
                .status(500)
                .send(
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
   FINAL TRANSACTION FIX
========================================================= */

app.post(
    '/api/free/redeem',
    async (req, res) => {

        console.log('');
        console.log(
            '========================================'
        );

        console.log(
            '➡️ POST /api/free/redeem'
        );

        console.log(
            '========================================'
        );


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
                '🔑 Key:',
                key ||
                '(missing)'
            );


            console.log(
                '📱 Device:',
                deviceId
                    ? deviceId.slice(
                        0,
                        12
                    ) + '...'
                    : '(missing)'
            );


            /* -------------------------------------------------
               KEY VALIDATION
            ------------------------------------------------- */

            if (!key) {

                return res.status(400).json({

                    ok: false,

                    code:
                        'KEY_MISSING',

                    error:
                        'Free Key नहीं मिली।'

                });

            }


            /* -------------------------------------------------
               DEVICE VALIDATION
            ------------------------------------------------- */

            if (!deviceId) {

                return res.status(400).json({

                    ok: false,

                    code:
                        'DEVICE_MISSING',

                    error:
                        'Device ID नहीं मिली।'

                });

            }


            /* -------------------------------------------------
               FORMAT
            ------------------------------------------------- */

            if (
                !key.startsWith(
                    'HRRY-FREE-'
                )
            ) {

                return res.status(400).json({

                    ok: false,

                    code:
                        'INVALID_FORMAT',

                    error:
                        'यह Free Key format valid नहीं है।'

                });

            }


            /* -------------------------------------------------
               DEVICE HASH
            ------------------------------------------------- */

            const deviceIdHash =
                hashDeviceId(
                    deviceId
                );


            /* -------------------------------------------------
               KEY INDEX
            ------------------------------------------------- */

            const indexSnapshot =
                await database
                    .ref(
                        `hrry_free_key_index/${key}`
                    )
                    .once(
                        'value'
                    );


            const requestId =
                indexSnapshot.val();


            if (!requestId) {

                console.log(
                    '❌ KEY NOT FOUND'
                );


                return res.status(404).json({

                    ok: false,

                    code:
                        'KEY_NOT_FOUND',

                    error:
                        'यह Free Key valid नहीं है।'

                });

            }


            console.log(
                '🆔 Request:',
                requestId
            );


            /* -------------------------------------------------
               KEY RECORD
            ------------------------------------------------- */

            const keyRef =
                database.ref(
                    `hrry_free_keys/${requestId}`
                );


            const beforeSnapshot =
                await keyRef.once(
                    'value'
                );


            const beforeRecord =
                beforeSnapshot.val();


            if (!beforeRecord) {

                return res.status(404).json({

                    ok: false,

                    code:
                        'RECORD_NOT_FOUND',

                    error:
                        'Free Key का database record नहीं मिला।'

                });

            }


            /* -------------------------------------------------
               RECORD KEY MATCH
            ------------------------------------------------- */

            if (
                normalizeKey(
                    beforeRecord.key
                ) !==
                key
            ) {

                return res.status(409).json({

                    ok: false,

                    code:
                        'KEY_RECORD_MISMATCH',

                    error:
                        'Free Key database record से match नहीं कर रही।'

                });

            }


            /* -------------------------------------------------
               DEVICE CHECK
            ------------------------------------------------- */

            const storedDeviceHash =
                String(
                    beforeRecord.deviceIdHash ||
                    ''
                );


            if (
                storedDeviceHash !==
                deviceIdHash
            ) {

                console.log(
                    '❌ DEVICE MISMATCH'
                );


                console.log(
                    'Stored:',
                    storedDeviceHash.slice(
                        0,
                        12
                    ) + '...'
                );


                console.log(
                    'Received:',
                    deviceIdHash.slice(
                        0,
                        12
                    ) + '...'
                );


                return res.status(403).json({

                    ok: false,

                    code:
                        'DEVICE_MISMATCH',

                    error:
                        'यह Free Key उस browser/device से match नहीं कर रही जिससे key बनाई गई थी। उसी browser में HRRY.TEST खोलकर नई Free Key बनाएं।'

                });

            }


            /* -------------------------------------------------
               EXPIRY CHECK
            ------------------------------------------------- */

            if (
                isExpired(
                    beforeRecord.expiresAt
                )
            ) {

                return res.status(410).json({

                    ok: false,

                    code:
                        'KEY_EXPIRED',

                    error:
                        'यह Free Key expire हो चुकी है।'

                });

            }


            /* -------------------------------------------------
               ALREADY REDEEMED
            ------------------------------------------------- */

            if (
                beforeRecord.used === true
            ) {

                /*
                  Same device + still valid.
                  Access is already active.
                */

                return res.status(200).json({

                    ok: true,

                    alreadyActive:
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
                        'active',

                    message:
                        'Free Key पहले से active है।'

                });

            }


            /* =================================================
               ATOMIC TRANSACTION
               
               IMPORTANT FIX:
               -----------------------------------------------
               पहले वाले code में invalid condition पर:

                   return;

               होता था।

               Firebase में undefined return transaction
               को ABORT कर देता है।

               यहाँ हर valid current object पर current
               वापस किया जाता है, इसलिए transaction
               बेवजह abort नहीं होगा।
            ================================================= */

            const redeemedAt =
                Date.now();


            const transactionResult =
                await keyRef.transaction(
                    function (
                        current
                    ) {

                        /*
                          Unexpectedly missing record.

                          Returning null means no valid record
                          can be created by this transaction.
                        */

                        if (
                            current === null
                        ) {

                            return null;

                        }


                        /*
                          If already redeemed, keep current
                          value instead of returning undefined.

                          This prevents the old
                          "committed=false" conflict path.
                        */

                        if (
                            current.used === true
                        ) {

                            return current;

                        }


                        /*
                          Device must remain the same.
                        */

                        if (
                            String(
                                current.deviceIdHash ||
                                ''
                            ) !==
                            deviceIdHash
                        ) {

                            return current;

                        }


                        /*
                          Expiry must remain valid.
                        */

                        if (
                            Number(
                                current.expiresAt ||
                                0
                            ) <=
                            Date.now()
                        ) {

                            return current;

                        }


                        /*
                          KEY MATCH
                        */

                        if (
                            normalizeKey(
                                current.key
                            ) !==
                            key
                        ) {

                            return current;

                        }


                        /*
                          SUCCESSFUL REDEEM
                        */

                        return {

                            ...current,

                            used:
                                true,

                            usedAt:
                                redeemedAt,

                            redeemedAt:
                                redeemedAt,

                            status:
                                'active'

                        };

                    },

                    undefined,

                    false
                );


            /* -------------------------------------------------
               TRANSACTION ERROR
            ------------------------------------------------- */

            if (
                transactionResult.error
            ) {

                console.error(
                    '❌ TRANSACTION ERROR:',
                    transactionResult.error
                );


                return res.status(500).json({

                    ok: false,

                    code:
                        'TRANSACTION_ERROR',

                    error:
                        transactionResult.error.message ||
                        'Firebase transaction failed.'

                });

            }


            /* -------------------------------------------------
               FINAL SNAPSHOT
            ------------------------------------------------- */

            const finalSnapshot =
                transactionResult.snapshot;


            const finalRecord =
                finalSnapshot
                    ? finalSnapshot.val()
                    : null;


            if (!finalRecord) {

                return res.status(404).json({

                    ok: false,

                    code:
                        'FINAL_RECORD_MISSING',

                    error:
                        'Redeem के बाद Free Key record नहीं मिला।'

                });

            }


            /* -------------------------------------------------
               FINAL DEVICE CHECK
            ------------------------------------------------- */

            if (
                String(
                    finalRecord.deviceIdHash ||
                    ''
                ) !==
                deviceIdHash
            ) {

                return res.status(403).json({

                    ok: false,

                    code:
                        'DEVICE_MISMATCH',

                    error:
                        'यह Free Key दूसरे browser/device से linked है।'

                });

            }


            /* -------------------------------------------------
               FINAL EXPIRY CHECK
            ------------------------------------------------- */

            if (
                isExpired(
                    finalRecord.expiresAt
                )
            ) {

                return res.status(410).json({

                    ok: false,

                    code:
                        'KEY_EXPIRED',

                    error:
                        'यह Free Key expire हो चुकी है।'

                });

            }


            /* -------------------------------------------------
               FINAL USED CHECK
            ------------------------------------------------- */

            if (
                finalRecord.used !== true
            ) {

                return res.status(409).json({

                    ok: false,

                    code:
                        'REDEEM_NOT_APPLIED',

                    error:
                        'Free Key redeem नहीं हो पाई। फिर से कोशिश करें।'

                });

            }


            /*
              At this point the key is active.

              Whether this request performed the actual
              transition or another simultaneous request
              did it first, the resulting access state is
              valid for this same device.
            */

            console.log('');
            console.log(
                '========================================'
            );

            console.log(
                '✅ FREE KEY REDEEM SUCCESS'
            );

            console.log(
                '🔑 Key:',
                finalRecord.key
            );

            console.log(
                '🆔 Request:',
                requestId
            );

            console.log(
                '⏰ Expires:',
                new Date(
                    Number(
                        finalRecord.expiresAt
                    )
                ).toISOString()
            );

            console.log(
                '========================================'
            );

            console.log('');


            return res.status(200).json({

                ok: true,

                alreadyActive:
                    Boolean(
                        beforeRecord.used === true
                    ),

                key:
                    finalRecord.key,

                expiresAt:
                    Number(
                        finalRecord.expiresAt
                    ),

                durationHours:
                    12,

                status:
                    'active',

                message:
                    'Free Key successfully activated.'

            });


        } catch (error) {

            console.error('');
            console.error(
                '❌ /api/free/redeem ERROR'
            );

            console.error(
                error
            );

            console.error('');


            return res.status(500).json({

                ok: false,

                code:
                    'SERVER_ERROR',

                error:
                    error.message ||
                    'Free Key redeem नहीं हो सकी।'

            });

        }

    }
);


/* =========================================================
   FREE ACCESS STATUS
========================================================= */

app.post(
    '/api/free/status',
    async (req, res) => {

        console.log('');
        console.log(
            '➡️ POST /api/free/status'
        );


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
                hashDeviceId(
                    deviceId
                );


            /*
              Find keys created for this device.
            */

            const deviceIndexSnapshot =
                await database
                    .ref(
                        `hrry_free_device_index/${deviceIdHash}`
                    )
                    .once(
                        'value'
                    );


            const deviceIndex =
                deviceIndexSnapshot.val();


            if (!deviceIndex) {

                return res.status(200).json({

                    ok: true,

                    active: false

                });

            }


            let requestIds = [];


            /*
              Current format
            */

            if (
                typeof deviceIndex === 'object' &&
                !Array.isArray(
                    deviceIndex
                )
            ) {

                requestIds =
                    Object.keys(
                        deviceIndex
                    );

            }


            /*
              Old format
            */

            if (
                typeof deviceIndex ===
                'string'
            ) {

                requestIds = [
                    deviceIndex
                ];

            }


            let activeRecord =
                null;


            /*
              Check all records.
            */

            for (
                const requestId
                of requestIds
            ) {

                const snapshot =
                    await database
                        .ref(
                            `hrry_free_keys/${requestId}`
                        )
                        .once(
                            'value'
                        );


                const record =
                    snapshot.val();


                if (!record) {
                    continue;
                }


                if (
                    String(
                        record.deviceIdHash ||
                        ''
                    ) !==
                    deviceIdHash
                ) {
                    continue;
                }


                /*
                  Redeemed required.
                */

                if (
                    record.used !== true
                ) {
                    continue;
                }


                /*
                  Expired access ignored.
                */

                if (
                    isExpired(
                        record.expiresAt
                    )
                ) {
                    continue;
                }


                /*
                  Select record with latest expiry.
                */

                if (
                    !activeRecord ||
                    Number(
                        record.expiresAt ||
                        0
                    ) >
                    Number(
                        activeRecord.expiresAt ||
                        0
                    )
                ) {

                    activeRecord =
                        record;

                }

            }


            if (!activeRecord) {

                return res.status(200).json({

                    ok: true,

                    active: false

                });

            }


            console.log(
                '✅ ACTIVE FREE ACCESS'
            );


            return res.status(200).json({

                ok: true,

                active: true,

                key:
                    activeRecord.key,

                expiresAt:
                    Number(
                        activeRecord.expiresAt
                    ),

                durationHours:
                    12,

                status:
                    'active'

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

    }
);


/* =========================================================
   FREE KEY PAGE
========================================================= */

function renderFreeKeyPage(
    record
) {

    const safeKey =
        escapeHtml(
            record.key
        );


    const safeExpiry =
        escapeHtml(
            new Date(
                Number(
                    record.expiresAt
                )
            ).toLocaleString(
                'en-IN',
                {
                    dateStyle:
                        'medium',

                    timeStyle:
                        'short'
                }
            )
        );


    const safeWebsite =
        escapeHtml(
            WEBSITE_URL
        );


    return `<!DOCTYPE html>

<html lang="hi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1.0"
>

<title>
    HRRY.TEST — Free Key
</title>

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
            #252958,
            #070811 65%
        );

    color: #ffffff;

    font-family:
        Arial,
        sans-serif;

}

.box {

    width: 100%;

    max-width: 440px;

    padding: 28px;

    border-radius: 28px;

    background:
        rgba(
            25,
            28,
            48,
            0.94
        );

    border:
        1px solid
        rgba(
            255,
            255,
            255,
            0.12
        );

    box-shadow:
        0 25px 80px
        rgba(
            0,
            0,
            0,
            0.55
        );

    text-align: center;

}

.icon {

    font-size: 56px;

    margin-bottom: 12px;

}

h1 {

    margin:
        0 0 8px;

    font-size: 28px;

}

.subtitle {

    color: #b7bdd1;

    line-height: 1.55;

    margin-bottom: 22px;

}

.key {

    padding:
        18px 14px;

    border-radius:
        16px;

    background:
        rgba(
            99,
            102,
            241,
            0.15
        );

    border:
        1px solid
        rgba(
            129,
            140,
            248,
            0.45
        );

    font-size:
        21px;

    font-weight:
        800;

    letter-spacing:
        1px;

    word-break:
        break-all;

    margin:
        15px 0;

}

button {

    width:
        100%;

    border:
        0;

    border-radius:
        15px;

    padding:
        15px;

    font-size:
        16px;

    font-weight:
        800;

    cursor:
        pointer;

    margin-top:
        10px;

}

.copy {

    background:
        linear-gradient(
            135deg,
            #6366f1,
            #8b5cf6
        );

    color:
        #ffffff;

}

.back {

    display:
        none;

    background:
        rgba(
            16,
            185,
            129,
            0.18
        );

    border:
        1px solid
        rgba(
            16,
            185,
            129,
            0.5
        );

    color:
        #d1fae5;

}

.info {

    margin-top:
        18px;

    color:
        #aeb4c8;

    font-size:
        13px;

    line-height:
        1.7;

}

.success {

    display:
        none;

    margin-top:
        12px;

    color:
        #86efac;

    font-weight:
        700;

}

</style>

</head>

<body>

<div class="box">

    <div class="icon">
        🎁🔑
    </div>

    <h1>
        Free Key Ready
    </h1>

    <div class="subtitle">
        तुम्हारी 12-hour Free Key तैयार है।
    </div>

    <div
        class="key"
        id="freeKey"
    >
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

        ⏰ Valid for 12 hours

        <br>

        📱 Key उसी browser/device पर
        redeem होगी जिससे request बनाई गई थी।

        <br>

        🔐 Key केवल एक बार redeem होगी।

        <br>

        🕒 Expires:
        ${safeExpiry}

    </div>

</div>


<script>

const WEBSITE_URL =
    ${JSON.stringify(
        WEBSITE_URL
    )};


async function copyKey() {

    const key =
        document
            .getElementById(
                'freeKey'
            )
            .innerText
            .trim();


    let copied =
        false;


    /*
      Modern Clipboard API
    */

    try {

        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {

            await navigator
                .clipboard
                .writeText(
                    key
                );

            copied =
                true;

        }

    } catch (error) {

        console.log(
            'Clipboard API failed.'
        );

    }


    /*
      Fallback
    */

    if (!copied) {

        try {

            const textarea =
                document.createElement(
                    'textarea'
                );


            textarea.value =
                key;


            textarea.style.position =
                'fixed';

            textarea.style.left =
                '-9999px';

            textarea.style.top =
                '0';

            textarea.style.opacity =
                '0';


            document.body.appendChild(
                textarea
            );


            textarea.focus();

            textarea.select();


            copied =
                document.execCommand(
                    'copy'
                );


            textarea.remove();

        } catch (error) {

            copied =
                false;

        }

    }


    /*
      Success
    */

    if (copied) {

        document
            .getElementById(
                'copySuccess'
            )
            .style.display =
                'block';


        document
            .getElementById(
                'copyButton'
            )
            .innerText =
                '✅ Key Copied';


        /*
          Back button appears only
          after successful copy.
        */

        document
            .getElementById(
                'backButton'
            )
            .style.display =
                'block';

    } else {

        alert(
            'Key copy नहीं हो पाई। कृपया key manually copy करें।'
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
   MESSAGE PAGE
========================================================= */

function renderMessagePage(
    title,
    message
) {

    const safeTitle =
        escapeHtml(
            title
        );


    const safeMessage =
        escapeHtml(
            message
        );


    const safeWebsite =
        escapeHtml(
            WEBSITE_URL
        );


    return `<!DOCTYPE html>

<html lang="hi">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>
    HRRY.TEST
</title>

<style>

body {

    margin: 0;

    min-height: 100vh;

    display: flex;

    align-items: center;

    justify-content: center;

    padding: 20px;

    background:
        #080912;

    color:
        #ffffff;

    font-family:
        Arial,
        sans-serif;

}

.box {

    width:
        100%;

    max-width:
        430px;

    padding:
        30px;

    border-radius:
        25px;

    background:
        #171927;

    border:
        1px solid
        #30334a;

    text-align:
        center;

}

h1 {

    font-size:
        25px;

}

p {

    color:
        #b8bdd0;

    line-height:
        1.6;

}

a {

    display:
        block;

    margin-top:
        22px;

    padding:
        14px;

    border-radius:
        14px;

    background:
        #6366f1;

    color:
        #ffffff;

    text-decoration:
        none;

    font-weight:
        800;

}

</style>

</head>

<body>

<div class="box">

    <h1>
        ${safeTitle}
    </h1>

    <p>
        ${safeMessage}
    </p>

    <a
        href="${safeWebsite}"
    >
        ↩️ Back to HRRY.TEST
    </a>

</div>

</body>

</html>`;

}


/* =========================================================
   404
========================================================= */

app.use(
    (req, res) => {

        return res
            .status(404)
            .json({

                ok: false,

                error:
                    'Endpoint not found.',

                path:
                    req.path

            });

    }
);


/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            '❌ GLOBAL ERROR:',
            error
        );


        if (
            error.message ===
            'Not allowed by CORS'
        ) {

            return res
                .status(403)
                .json({

                    ok: false,

                    error:
                        'CORS origin not allowed.'

                });

        }


        return res
            .status(500)
            .json({

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
            '🚀 HRRY.TEST FREE KEY BACKEND STARTED'
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
            'FIREBASE:',
            firebaseReady
                ? 'CONNECTED ✅'
                : 'NOT CONNECTED ❌'
        );

        console.log(
            '========================================'
        );

        console.log('');

    }
);
