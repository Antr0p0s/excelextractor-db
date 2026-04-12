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

module.exports = {
    getFileNames,
    getFile
};