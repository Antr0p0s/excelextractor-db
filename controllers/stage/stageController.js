const axios = require("axios");

const {
    S3Client,
    GetObjectCommand,
    ListObjectsV2Command
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const stage_ip =  process.env.STAGE_ADDRESS
const token = process.env.STAGE_AUTH_KEY;

const s3 = new S3Client({
    region: process.env.SEAWEED_REGION || "us-east-1",
    endpoint: process.env.SEAWEED_S3_ENDPOINT,

    credentials: {
        accessKeyId: process.env.SEAWEED_ACCESS_KEY,
        secretAccessKey: process.env.SEAWEED_SECRET_KEY,
    },
    forcePathStyle: true,
});

const clients = new Set();

let lastFrameReceivedAt = Date.now();

const STREAM_TIMEOUT_MS = 15 * 60 * 1000; 

const getFileNames = async (req, res) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: process.env.SEAWEED_BUCKET_STAGE,
            Prefix: "1stage/",
        });

        const response = await s3.send(command);

        if (!response.Contents) {
            return res.status(200).json({ files: [] });
        }

        const files = response.Contents
            .filter((obj) => obj.Key !== "1stage/")
            .map((obj) => ({
                key: obj.Key,

                size_mb: obj.Size
                    ? Math.round(obj.Size / (1024 * 1024) * 100) / 100
                    : 0,

                last_modified: obj.LastModified
                    ? obj.LastModified.toISOString()
                    : null,
            }));

        files.sort(
            (a, b) =>
                new Date(b.last_modified) - new Date(a.last_modified)
        );

        return res.status(200).json({ files });

    } catch (err) {
        console.error("SeaweedFS List Error:", err);

        return res.status(500).json({
            message: "SeaweedFS Error",
            error: err.message,
        });
    }
};

/**
 * Generate presigned download URL
 */
const getFile = async (req, res) => {
    const { path } = req.body;

    if (path.endsWith('.npy')) {
        const url = `${stage_ip}/get-npy-json?file_key=${path}`
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    // 'Content-Type' is set automatically when using URLSearchParams
                },
            })

            const data = await response.json()

            return res.status(200).json({ data });
        } catch (err) {
            console.error("Python fetch error:", err);
            res.status(500).json({ "message": "Could not get python data" });
        }
    } else { // png, mp4
        try {
            // Create the command to get the specific object using its Key
            const command = new GetObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME_STAGE,
                Key: path, // Use the key, not the full URL
            });

            // Generate a URL that expires in 60 minutes (3600 seconds)   (jk 15 min)     
            const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 * 15 });

            // Redirect the browser to the temporary, authorized URL
            res.json(presignedUrl);

        } catch (err) {
            console.error("Presigned URL Error:", err);
            res.status(500).json({ "message": "Could not authorize file access" });
        }
    }
};

const skipChunk = async (req, res) => {
    const url = `${stage_ip}/skip_chunk`;

    const { chunk_idx } = req.body;

    try {
        const formData = new URLSearchParams();

        formData.append("chunk_index", chunk_idx);

        const response = await fetch(url, {
            method: "POST",

            headers: {
                Authorization: `Bearer ${token}`,
            },

            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();

            console.error(`Backend Error: ${errorText}`);

            throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();

        res.status(200).json(data);

    } catch (error) {
        console.error("Error skipping chunk:", error);

        res.status(500).json({
            error: "Failed to skip chunk",
        });
    }
};

/**
 * SSE stream endpoint
 */
const streamMeasurement = async (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });

    clients.add(res);

    console.log(`[STREAM] Client connected (${clients.size} total)`);

    req.on("close", () => {
        clients.delete(res);

        console.log(
            `[STREAM] Client disconnected (${clients.size} left)`
        );
    });
};

function broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;

    for (const client of clients) {
        try {
            client.write(payload);

        } catch (err) {
            console.error("[STREAM] Client write failed, removing");

    }, 1000 / 7); // ~10 FPS output

            clients.delete(client);
        }
    }
}

/**
 * Receive frame
 */
const postFrame = async (req, res) => {
    try {
        const data = req.body;

        if (!data?.metadata) {
            return res.status(400).end();
        }

        const now = Date.now();

        lastFrameReceivedAt = now;

        broadcast({
            ...data,
            receivedAt: now,
        });

        res.status(200).end();

    } catch (err) {
        console.error("postFrame error:", err);

        res.status(500).end();
    }
};

/**
 * Auto stream reset
 */
setInterval(() => {
    const now = Date.now();

    if (now - lastFrameReceivedAt > STREAM_TIMEOUT_MS) {
        console.log("[STREAM] Timeout reset");

        lastFrameReceivedAt = now;

        broadcast({
            status: "reset",
            message: "Stream inactive, reset",
        });
    }
}, 5000);

/**
 * Manual stream reset
 */
const resetStream = async (req, res) => {
    console.log("[STREAM RESET] Triggered");

    lastFrameReceivedAt = Date.now();

    broadcast({
        status: "reset",
        message: "Stream manually reset",
    });

    res.json({
        status: "reset ok",
    });
};



module.exports = {
    getFileNames,
    getFile,
    skipChunk,
    streamMeasurement,
    postFrame,
    resetStream,
};