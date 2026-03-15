import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Forward the request to PiAPI upload endpoint
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
        return res.status(400).json({ error: 'Missing x-api-key header' });
    }

    try {
        const response = await fetch('https://upload.theapi.app/api/ephemeral_resource', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
            },
            body: JSON.stringify(req.body),
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Proxy request failed' });
    }
}
