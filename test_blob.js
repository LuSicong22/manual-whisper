import fs from 'fs';
import { fetch } from 'undici';

async function test() {
    console.log('Fetching token...');
    const tokenRes = await fetch('https://whisper-omega.vercel.app/api/blob-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: 'test.wav', callbackUrl: 'https://whisper-omega.vercel.app/api/blob-upload' } })
    });
    const data = await tokenRes.json();
    const clientToken = data.clientToken;
    console.log('Token:', clientToken);

    console.log('Uploading...');
    const uploadUrl = `https://blob.vercel-storage.com/test.wav`;
    const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${clientToken}`,
            'x-api-version': '7'
        },
        body: 'test data'
    });
    console.log('Put Status:', putRes.status);
    console.log('Put Body:', await putRes.text());
}
test().catch(console.error);
