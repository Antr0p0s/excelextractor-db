const axios = require("axios");

const Filename = require('../../model/Filename.js');

const {
    S3Client,
    GetObjectCommand,
    ListObjectsV2Command,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const stage_ip = process.env.STAGE_ADDRESS
const stage_ip_files = process.env.STAGE_GRAPH_ADDRESS
const token = process.env.STAGE_AUTH_KEY;

const s3 = new S3Client({
    region: process.env.SEAWEED_REGION || "us-east-1",
    endpoint: process.env.SEAWEED_S3_ENDPOINT,

    credentials: {
        accessKeyId: process.env.SEAWEED_ACCESS_KEY,
        secretAccessKey: process.env.SEAWEED_SECRET_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
});

const clients = new Set();

let lastFrameReceivedAt = Date.now();

const STREAM_TIMEOUT_MS = 15 * 60 * 1000;

const getFileNames = async (req, res) => {
    try {
        const command = new ListObjectsV2Command({
            Bucket: process.env.SEAWEED_BUCKET,
            Name: "1stage",
        });

        const response = await s3.send(command);

        if (!response.Contents) {
            return res.status(200).json({ files: [] });
        }

        const files = response.Contents
            .filter((obj) => obj.Name !== "1stage/")
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


        const buffercommand = new ListObjectsV2Command({
            Bucket: process.env.SEAWEED_UPLOAD_BUCKET,
            Name: "1stage",
        });

        const bufferresponse = await s3.send(command);

        if (!bufferresponse.Contents) {
            return res.status(200).json({ files: [] });
        }

        const bufferfiles = response.Contents
            .map((obj) => ({
                key: obj.Key,

                size_mb: obj.Size
                    ? Math.round(obj.Size / (1024 * 1024) * 100) / 100
                    : 0,

                last_modified: obj.LastModified
                    ? obj.LastModified.toISOString()
                    : null,
            }));

        bufferfiles.sort(
            (a, b) =>
                new Date(b.last_modified) - new Date(a.last_modified)
        );

        const nicknames = await Filename.find()
            // .select("originalName displayName -_id");

        return res.status(200).json({ files, bufferfiles, nicknames });

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
        const url = `${stage_ip_files}/get-npy-json?file_key=${path}`
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
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
                Bucket: process.env.SEAWEED_BUCKET,
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

const initiate = async (req, res) => {
    const { fileName, folderName } = req.body;

    if (!fileName || !folderName) return res.status(401).end()

    const s3Key = `${folderName}/${fileName}`;

    const command = new CreateMultipartUploadCommand({ Bucket: process.env.SEAWEED_UPLOAD_BUCKET, Key: s3Key });
    const response = await s3.send(command);
    res.json({ uploadId: response.UploadId, s3Key });
}

const presign = async (req, res) => {
    const { s3Key, uploadId, partNumber } = req.body;

    if (!s3Key || !uploadId || !partNumber) return res.status(401).end();

    try {
        const command = new UploadPartCommand({
            Bucket: process.env.SEAWEED_UPLOAD_BUCKET,
            Key: s3Key,
            UploadId: uploadId,
            PartNumber: parseInt(partNumber, 10) // Ensure it's treated strictly as a number
        });

        // Generate the URL. We can pass an empty header rule configuration if your proxy forces it,
        // but removing content-type checks during browser requests is safest.
        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        res.json({ presignedUrl });
    } catch (err) {
        console.error("Presign generation error:", err);
        res.status(500).json({ error: "Failed to generate presigned URL" });
    }
}

const presignOld = async (req, res) => {
    const { s3Key, uploadId, partNumber } = req.body;

    if (!s3Key || !uploadId || !partNumber) return res.status(401).end()

    const command = new UploadPartCommand({
        Bucket: process.env.SEAWEED_UPLOAD_BUCKET, Key: s3Key, UploadId: uploadId, PartNumber: partNumber
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ presignedUrl });
}

const complete = async (req, res) => {
    const { s3Key, uploadId, parts } = req.body;

    if (!s3Key || !uploadId || !parts) return res.status(401).end()

    const command = new CompleteMultipartUploadCommand({
        Bucket: process.env.SEAWEED_UPLOAD_BUCKET, Key: s3Key, UploadId: uploadId,
        MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) }
    });
    await s3.send(command);
    res.json({ success: true });
}

const compile = async (req, res) => {
    const url = `${stage_ip}/compile`;
    const { folder } = req.body;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ folder })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Backend Error: ${errorText}`);
            throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        console.error("Error compiling:", error);
        return res.status(500).json({ error: "Failed to compile" });
    }
};

const Annotation = require('../../model/Annotation.js')

const getFileMetaData = async (req, res) => {
    const { filePath } = req.body;

    if (!filePath) {
        return res.status(400).json({ 'message': 'Missing required parameter: filePath' });
    }

    try {
        // Find all independent annotation documents matching this exact file path string
        const records = await Annotation.find({ filePath: filePath.trim() });

        // Mongoose .find() always returns an array. If empty, return [] safely.
        if (!records || records.length === 0) {
            return res.status(200).json([]);
        }

        // Return the array of annotation documents directly to the frontend
        return res.status(200).json(records);

    } catch (error) {
        console.error(`Database error fetching annotations for ${filePath}:`, error);
        return res.status(500).json({
            'message': 'Internal server error accessing database registry',
            'error': error.message
        });
    }
};

const putMetaData = async (req, res) => {
    const { annotation } = req.body;

    if (!annotation || typeof annotation !== 'object') {
        return res.status(400).json({
            message: 'Invalid payload: annotation must be a valid object'
        });
    }

    try {
        // Purely create and save a brand-new independent document
        const newRecord = await Annotation.create(annotation);

        return res.status(200).json({
            message: 'Annotation created successfully',
            annotation: newRecord
        });

    } catch (error) {
        console.error(`Database error creating new annotation document:`, error);
        return res.status(500).json({
            message: 'Internal server error processing creation request',
            error: error.message
        });
    }
};

const deleteMetaData = async (req, res) => {
    const { annotationId } = req.body;

    if (!annotationId) {
        return res.status(400).json({
            message: 'Missing required parameter: annotationId is required.'
        });
    }

    try {
        // Find the document with the matching custom ID and remove it completely
        const deletedRecord = await Annotation.findOneAndDelete({ id: annotationId });

        // If no document matched that specific annotation ID
        if (!deletedRecord) {
            return res.status(404).json({
                message: 'No annotation found matching the provided identifier.'
            });
        }

        return res.status(200).json({
            message: 'Annotation found and removed successfully',
            deletedAnnotation: deletedRecord
        });

    } catch (error) {
        console.error(`Database error searching and deleting annotation ${annotationId}:`, error);
        return res.status(500).json({
            message: 'Internal server error processing deletion request',
            error: error.message
        });
    }
};

const changeFileName = async (req, res) => {
    try {
        const { originalName, newName } = req.body;

        if (!originalName || !newName) {
            return res.status(400).json({
                message: "originalName and newName are required"
            });
        }

        const file = await Filename.findOne({
            originalName
        });

        if (!file) {
            const newFile = await Filename.create({
                originalName,
                displayName: newName
            });

            return res.status(201).json({
                message: "Filename created",
                file: newFile
            });
        }

        file.displayName = newName;
        await file.save();

        return res.status(200).json({
            message: "Display name updated",
            file
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            message: "Failed to change filename",
            error: error.message
        });
    }
};

module.exports = {
    getFileNames,
    getFile,
    skipChunk,
    streamMeasurement,
    postFrame,
    resetStream,
    initiate,
    presign,
    complete,
    compile,
    getFileMetaData,
    putMetaData,
    deleteMetaData,
    changeFileName
};