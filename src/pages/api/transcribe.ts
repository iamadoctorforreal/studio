import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable();
    const [fields, files] = await form.parse(req);
    
    const uploadedFile = files.file?.[0]; // This is the actual file uploaded
    // const filePathFromFields = fields.filePath?.[0]; // This was problematic if it was a GCS URI
    const languageCode = fields.languageCode?.[0] || 'en';

    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided in the upload.' });
    }

    // Use the path of the uploaded file (formidable saves it temporarily)
    const buffer = await fs.promises.readFile(uploadedFile.filepath);
    const mimeType = uploadedFile.mimetype; // Get the MIME type from formidable

    if (!mimeType) {
      return res.status(400).json({ error: 'Could not determine file MIME type.' });
    }

    const HUGGINGFACE_MODEL_ID = process.env.HUGGINGFACE_MODEL_ID || "openai/whisper-large-v3"; // User updated to v3
    const API_URL = `https://api-inference.huggingface.co/models/${HUGGINGFACE_MODEL_ID}`;
    const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

    if (!HUGGINGFACE_API_KEY) {
      console.error('Hugging Face API key is not configured.');
      return res.status(500).json({ error: 'API key for transcription service is not configured.' });
    }

    let result: any; // Declare result here, with 'any' or a more specific type if known

    try {
      console.time('HuggingFace API Call');
      const headers = {
        "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
        "Content-Type": mimeType,
      };

      const hfResponse = await fetch(API_URL, {
        method: 'POST',
        headers: headers,
        body: buffer,
      });
      console.timeEnd('HuggingFace API Call');

      if (!hfResponse.ok) {
        const errorBody = await hfResponse.text();
        console.error('Hugging Face API error:', hfResponse.status, hfResponse.statusText, errorBody);
        throw new Error(`Hugging Face API error: ${hfResponse.status} ${hfResponse.statusText}. Details: ${errorBody}`);
      }

      result = await hfResponse.json(); // Assign value to result here

    } catch (apiError: any) {
      // If the API call itself fails (network error, or error thrown above), 
      // this will be caught by the outer catch block.
      // We re-throw to ensure it's handled by the main error handler for the API route.
      throw apiError; 
    }

    // Now result is accessible here
    if (!result || typeof result.text !== 'string') {
        console.error('Unexpected Hugging Face API response structure:', result);
        throw new Error('Unexpected response structure from Hugging Face API.');
    }

    const srtContent = `1\n00:00:00,000 --> 00:00:30,000\n${result.text.trim()}\n`;

    res.status(200).json({ srtContent });
  } catch (error: any) {
    console.error('Transcription error in API route:', error);
    res.status(500).json({ error: error.message });
  }
}