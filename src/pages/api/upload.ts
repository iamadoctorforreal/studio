import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { storageService } from '@/services/storage';

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
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to GCS
    const audioFileUri = await storageService.uploadFile(file.filepath, 'audio');

    res.status(200).json({ audioFileUri });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
}