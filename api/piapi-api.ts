import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
        return res.status(400).json({ error: 'Missing x-api-key header' });
    }

    // Extract the path after /api/piapi-api
    const path = req.query.path as string || '';

    try {
        const response = await fetch(`https://api.piapi.ai/${path}`, {
            method: req.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            ...(req.method === 'POST' ? { body: JSON.stringify(req.body) } : {}),
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Proxy request failed' });
    }
}
