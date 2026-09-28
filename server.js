const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 8080;

const SHRINKME_API_KEY = process.env.SHRINKME_API_KEY;

// अपनी वेबसाइट का URL यहाँ डालना
const WEBSITE_URL = "https://hrry.test";

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "HRRY Test Backend"
    });
});

app.post("/api/free/start", async (req, res) => {
    try {

        const deviceId = req.body.deviceId;

        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: "Device ID missing"
            });
        }

        if (!SHRINKME_API_KEY) {
            return res.status(500).json({
                success: false,
                message: "ShrinkMe API key is not configured"
            });
        }

        /*
         * अभी temporary destination बनाया जा रहा है।
         * अगले step में इसे one-time verification URL बनाएँगे।
         */

        const destination =
            `${WEBSITE_URL}/free-complete?device=${encodeURIComponent(deviceId)}`;

        const apiUrl =
            `https://shrinkme.io/api?api=${encodeURIComponent(SHRINKME_API_KEY)}&url=${encodeURIComponent(destination)}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error("ShrinkMe API request failed");
        }

        const data = await response.json();

        if (!data.shortenedUrl) {
            return res.status(500).json({
                success: false,
                message: "ShrinkMe did not return a short URL",
                response: data
            });
        }

        return res.json({
            success: true,
            shortUrl: data.shortenedUrl
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Unable to create ShrinkMe link"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
