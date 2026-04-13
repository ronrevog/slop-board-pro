const fs = require('fs');
const path = require('path');
const https = require('https');

const configPath = path.join(require('os').homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const refreshToken = config.tokens?.refresh_token;

function getAccessToken() {
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
            client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
        }).toString();
        const req = https.request({
            hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data).access_token));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function main() {
    const token = await getAccessToken();

    // List buckets in the project
    const req = https.request({
        hostname: 'storage.googleapis.com',
        path: '/storage/v1/b?project=slop-board-pro',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            const json = JSON.parse(data);
            if (json.items) {
                json.items.forEach(b => console.log('  Bucket:', b.name));
            } else {
                console.log(data);
            }
        });
    });
    req.on('error', console.error);
    req.end();
}

main();
