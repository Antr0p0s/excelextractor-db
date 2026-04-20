const axios = require("axios");
const { S3Client } = require('@aws-sdk/client-s3');
const { GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.SC_SECRET_KEY,
    },
    // forcePathStyle is often required for non-AWS providers (like MinIO)
    forcePathStyle: true,
});

const clients = new Set();

const getFileNames = async (req, res) => {
    try {
        // 1. List objects from S3/MinIO
        const command = new ListObjectsV2Command({
            Bucket: process.env.S3_BUCKET_NAME_STAGE,
            Prefix: "1stage/",
        });

        const response = await s3.send(command);

        if (!response.Contents) {
            return res.status(200).json({ files: [] });
        }

        // 2. Extract metadata
        const files = response.Contents
            .filter((obj) => obj.Key !== "1stage/") // skip folder marker
            .map((obj) => ({
                key: obj.Key,
                size_mb: obj.Size
                    ? Math.round(obj.Size / (1024 * 1024) * 100000) / 100000
                    : 0,
                last_modified: obj.LastModified
                    ? obj.LastModified.toISOString()
                    : null,
            }));

        // 3. Sort by newest first
        files.sort(
            (a, b) =>
                new Date(b.last_modified) - new Date(a.last_modified)
        );

        return res.status(200).json({ files });

    } catch (err) {
        console.error("List files Error:", err);

        return res.status(500).json({
            message: "S3 Error",
            error: err.message,
        });
    }
};

const getFile = async (req, res) => {
    const { path } = req.body;

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

const stage_ip = process.env.STAGE_ADDRESS

const skipChunk = async (req, res) => {
    const url = `${stage_ip}/skip_chunk`;
    const token = process.env.STAGE_AUTH_KEY;

    // Pull chunk_idx from the request body (sent from your React frontend)
    const { chunk_idx } = req.body;

    try {
        // FastAPI Form(...) expects application/x-www-form-urlencoded
        const formData = new URLSearchParams();
        formData.append('chunk_index', chunk_idx);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                // 'Content-Type' is set automatically when using URLSearchParams
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Backend Error: ${errorText}`);
            throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (error) {
        console.error('Error skipping chunk:', error);
        res.status(500).json({ error: 'Failed to skip chunk' });
    }
};

let frameBuffer = new Map();   // index -> frame
let nextIndex = 0;

const MAX_BUFFER_SIZE = 200;
const MAX_WAIT_MS = 5000; // wait 2s before skipping

let lastEmitTime = Date.now();
let lastFrameReceivedAt = Date.now();

const STREAM_TIMEOUT_MS = 30 * 60 * 1000; // 30 minute

const streamMeasurement = async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // ✅ add client
    clients.add(res);

    console.log(`[STREAM] Client connected (${clients.size} total)`);

    req.on('close', () => {
        clients.delete(res);

        console.log(`[STREAM] Client disconnected (${clients.size} left)`);
    });
};

setInterval(() => {
    const now = Date.now();

    if (frameBuffer.has(nextIndex)) {
        const frame = frameBuffer.get(nextIndex);
        broadcast(frame);
        frameBuffer.delete(nextIndex);
        nextIndex++;
    }

    if (now - lastEmitTime > MAX_WAIT_MS) {
        nextIndex++;
        lastEmitTime = now;
    }
}, 1000 / 7);

function broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;

    for (const client of clients) {
        try {
            client.write(payload);
        } catch (err) {
            console.error("[STREAM] Client write failed, removing");
            clients.delete(client);
        }
    }
}

const postFrame = async (req, res) => {
    try {
        const data = req.body;
        const idx = data?.metadata?.index;

        if (idx === undefined) {
            return res.status(400).end();
        }

        const now = Date.now();

        // ✅ Track last received frame time
        lastFrameReceivedAt = now;

        // Store frame in buffer
        frameBuffer.set(idx, {
            ...data,
            receivedAt: now
        });

        // Prevent memory explosion
        if (frameBuffer.size > MAX_BUFFER_SIZE) {
            const oldestKey = Math.min(...frameBuffer.keys());
            frameBuffer.delete(oldestKey);
        }

        res.status(200).end();
    } catch (err) {
        console.error("postFrame error:", err);
        res.status(500).end();
    }
};

const resetStream = async (req, res) => {
    console.log("[STREAM RESET] Triggered");

    frameBuffer.clear();
    nextIndex = 0;
    lastFrameReceivedAt = Date.now();

    // 🔥 notify ALL clients
    broadcast({
        status: "reset",
        message: "Stream manually reset"
    });

    res.json({ status: "reset ok" });
};

module.exports = {
    getFileNames,
    getFile,
    skipChunk,
    streamMeasurement,
    postFrame,
    resetStream
};