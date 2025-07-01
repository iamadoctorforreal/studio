import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';

// Initialize Google Cloud Storage (if credentials are available)
let storage: Storage | null = null;

try {
  // Try to initialize Google Cloud Storage
  // This will work if GOOGLE_APPLICATION_CREDENTIALS is set or if running on GCP
  storage = new Storage();
} catch (error) {
  console.warn('Google Cloud Storage not initialized. Using local storage fallback.');
}

const BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'news-automator-storage';

export const storageService = {
  /**
   * Upload a file to Google Cloud Storage or local storage as fallback
   */
  uploadFile: async (filepath: string, destinationFolder: string): Promise<string> => {
    const filename = path.basename(filepath);
    const destination = `${destinationFolder}/${Date.now()}_${filename}`;

    if (storage) {
      try {
        // Upload to Google Cloud Storage
        const bucket = storage.bucket(BUCKET_NAME);
        const file = bucket.file(destination);
        
        await bucket.upload(filepath, {
          destination: destination,
          metadata: {
            cacheControl: 'public, max-age=31536000',
          },
        });

        // Make the file publicly readable (optional)
        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${destination}`;
        console.log(`File uploaded to GCS: ${publicUrl}`);
        return publicUrl;
      } catch (error) {
        console.error('Error uploading to GCS:', error);
        // Fall back to local storage
      }
    }

    // Local storage fallback
    const uploadsDir = path.join(process.cwd(), 'uploads', destinationFolder);
    
    // Ensure directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const localDestination = path.join(uploadsDir, filename);
    
    // Copy file to uploads directory
    fs.copyFileSync(filepath, localDestination);
    
    const localUrl = `/uploads/${destinationFolder}/${filename}`;
    console.log(`File stored locally: ${localUrl}`);
    return localUrl;
  },

  /**
   * Delete a file from storage
   */
  deleteFile: async (fileUrl: string): Promise<boolean> => {
    if (storage && fileUrl.includes('storage.googleapis.com')) {
      try {
        // Extract file path from GCS URL
        const urlParts = fileUrl.split('/');
        const fileName = urlParts.slice(-2).join('/'); // folder/filename
        
        const bucket = storage.bucket(BUCKET_NAME);
        await bucket.file(fileName).delete();
        
        console.log(`File deleted from GCS: ${fileName}`);
        return true;
      } catch (error) {
        console.error('Error deleting from GCS:', error);
        return false;
      }
    } else {
      // Local file deletion
      try {
        const localPath = path.join(process.cwd(), fileUrl);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          console.log(`Local file deleted: ${localPath}`);
          return true;
        }
      } catch (error) {
        console.error('Error deleting local file:', error);
      }
    }
    
    return false;
  },

  /**
   * Get a signed URL for temporary access (GCS only)
   */
  getSignedUrl: async (fileName: string, expiresIn: number = 3600): Promise<string | null> => {
    if (!storage) {
      console.warn('Google Cloud Storage not available for signed URLs');
      return null;
    }

    try {
      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(fileName);
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
      });

      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      return null;
    }
  }
};