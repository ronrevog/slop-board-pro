/**
 * Apply CORS config to Firebase Storage bucket using Firebase CLI credentials.
 * Run: node apply-cors.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Read Firebase CLI credentials
const configPath = path.join(require('os').homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const refreshToken = config.tokens?.refresh_token;

if (!refreshToken) {
    console.error('No refresh token found. Run: firebase login');
    process.exit(1);
}

// Step 1: Exchange refresh token for access token
function getAccessToken() {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
            client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
        }).toString();

        const req = https.request({
            hostname: 'oauth2.googleapis.com',
            path: '/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const json = JSON.parse(data);
                if (json.access_token) resolve(json.access_token);
                else reject(new Error('Failed to get token: ' + data));
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// Step 2: Set CORS on the bucket
function setCors(accessToken, bucketName) {
    const corsConfig = [
        {
            origin: [
                "http://localhost:3001",
                "http://localhost:3000",
                "http://localhost:5173",
                "https://slop-board-pro.vercel.app",
                "https://slop-board-pro.web.app",
                "https://slop-board-pro.firebaseapp.com"
            ],
            method: ["GET", "POST", "PUT", "DELETE", "HEAD"],
            maxAgeSeconds: 3600,
            responseHeader: ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"]
        }
    ];

    const patchData = JSON.stringify({ cors: corsConfig });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'storage.googleapis.com',
            path: `/storage/v1/b/${bucketName}?fields=cors`,
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(patchData),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                console.log('Response:', data);
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
                else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            });
        });
        req.on('error', reject);
        req.write(patchData);
        req.end();
    });
}

async function main() {
    console.log('Getting access token...');
    const token = await getAccessToken();
    console.log('Got access token ✅');

    // Try the .firebasestorage.app bucket name first, then .appspot.com
    const buckets = [
        'slop-board-pro.firebasestorage.app',
        'slop-board-pro.appspot.com',
    ];

    for (const bucket of buckets) {
        console.log(`\nApplying CORS to gs://${bucket}...`);
        try {
            await setCors(token, bucket);
            console.log(`✅ CORS set on ${bucket}`);
        } catch (err) {
            console.log(`❌ Failed for ${bucket}: ${err.message}`);
        }
    }
}

main().catch(console.error);
