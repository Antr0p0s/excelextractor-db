// const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
// const { format } = require('date-fns');

// const { S3Client } = require('@aws-sdk/client-s3');

// // Configure the S3 Client
// const s3 = new S3Client({
//     region: process.env.S3_REGION, // e.g., "us-east-1"
//     endpoint: process.env.S3_ENDPOINT, // e.g., "https://s3.mrkiter.com"
//     credentials: {
//         accessKeyId: process.env.S3_ACCESS_KEY,
//         secretAccessKey: process.env.SC_SECRET_KEY,
//     },
//     // forcePathStyle is often required for non-AWS providers (like MinIO)
//     forcePathStyle: true,
// });
// const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// const MAX_LINES = 5000
// let updateHappend = false
// let reqLoq = ''
// const logName = `currentReqLoq.txt`

// let isInitializing = true;

// const init = async () => {
//     try {
//         const response = await s3.send(new GetObjectCommand({
//             Bucket: BUCKET_NAME,
//             Key: `logs/${logName}`
//         }));
//         const data = await response.Body.transformToString();
//         // Prepend current session logs to what was on S3 to avoid loss
//         reqLoq = data + reqLoq;
//         setInterval(flushToS3, 60000); //once a minute
//     } catch (readErr) {
//         console.error("S3 Read Error:", readErr);
//         process.exit()
//     } finally {
//         isInitializing = false;
//     }
// }
// init();

// const flushToS3 = async () => {
//     if (!updateHappend || isInitializing) return;

//     try {
//         const currentData = reqLoq;
//         const lines = currentData.trim().split('\n');

//         if (lines.length > MAX_LINES) {
//             const ts = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
//             // Archive the full current block
//             logEvents(`SYSTEM\tLoghandler - \t-\t-\tLogs saved\t-`);
//             await s3.send(new PutObjectCommand({
//                 Bucket: BUCKET_NAME,
//                 Key: `logs/archive/log_${ts}.txt`,
//                 Body: currentData,
//                 ContentType: 'text/plain'
//             }));
//             reqLoq = '';

//             await s3.send(new PutObjectCommand({
//                 Bucket: BUCKET_NAME,
//                 Key: `logs/${logName}`,
//                 Body: '',
//                 ContentLength: 0, // Optional: Explicitly state the size
//                 ContentType: 'text/plain'
//             }));

//             logEvents(`SYSTEM\tLoghandler - \t-\t-\tLogs archived and cleared\t-`);
//         } else {
//             logEvents(`SYSTEM\tLoghandler - \t-\t-\tLogs saved\t-`);
//             // Normal update to the current file
//             await s3.send(new PutObjectCommand({
//                 Bucket: BUCKET_NAME,
//                 Key: `logs/${logName}`,
//                 Body: currentData,
//                 ContentType: 'text/plain'
//             }));

//         }
//         updateHappend = false;
//     } catch (err) {
//         console.error("Flush failed:", err);
//     }
// };

const getCurrentLogs = () => {
  return reqLoq
}

exports.logEvents = async function (req, options = {}) {
  if (!req) return;

  const method = req.method || "N/A";
  const url = req.originalUrl || req.url || "N/A"; // originalUrl includes route
  const path = req.path || "N/A";
  const user = options.user || req.user?.id || "unknown";
  const id = options.id || null;
  const hasPassword = options.hasPassword || (req.body?.password ? true : false);

  console.log(
    `[${new Date().toISOString()}] ${method} ${url}` +
    (user ? ` - user: ${user}` : "") +
    (id ? ` - id: ${id}` : "") +
    (hasPassword ? " - contains password" : "")
  );
};

process.on('SIGTERM', async () => {
  console.log('SIGTERM received: flushing logs...');
  await flushToS3();
  process.exit(0);
});
