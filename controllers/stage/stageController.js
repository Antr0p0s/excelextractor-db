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
                    ? Math.round(obj.Size / (1024 * 1024) * 100) / 100
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
        console.log(path)

        // Generate a URL that expires in 60 minutes (3600 seconds)   (jk 15 min)     
        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 * 15 });

        // Redirect the browser to the temporary, authorized URL
        res.json(presignedUrl);

    } catch (err) {
        console.error("Presigned URL Error:", err);
        res.status(500).json({ "message": "Could not authorize file access" });
    }
}

// const stage_ip = 'https://stage.randomwebserver.eu'
const stage_ip = 'http://127.0.0.1:8000'

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
const MAX_WAIT_MS = 1000; // wait 2s before skipping

let lastEmitTime = Date.now();
let lastFrameReceivedAt = Date.now();

const STREAM_TIMEOUT_MS = 60 * 1000; // 1 minute

const streamMeasurement = async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const interval = setInterval(() => {
        const now = Date.now();

        // 🚨 RESET if no frames received for 1 minute
        if (now - lastFrameReceivedAt > STREAM_TIMEOUT_MS) {
            console.log('[STREAM] No frames for 60s → resetting state');

            frameBuffer.clear();
            nextIndex = 0;
            lastEmitTime = now;

            // Optionally notify frontend
            res.write(`data: ${JSON.stringify({
                status: "reset",
                message: "Stream inactive for 60s, waiting for new frames"
            })}\n\n`);

            return;
        }

        // ✅ If next frame exists → send it
        if (frameBuffer.has(nextIndex)) {
            const frame = frameBuffer.get(nextIndex);
            res.write(`data: ${JSON.stringify(frame)}\n\n`);

            frameBuffer.delete(nextIndex);
            nextIndex++;
            lastEmitTime = now;
            return;
        }

        // ⏱️ If waiting too long → skip frame
        if (now - lastEmitTime > MAX_WAIT_MS) {
            nextIndex++;
            lastEmitTime = now;
        }

    }, 100); // ~10 FPS output

    req.on('close', () => {
        clearInterval(interval);
    });
};

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

module.exports = {
    getFileNames,
    getFile,
    skipChunk,
    streamMeasurement,
    postFrame
};