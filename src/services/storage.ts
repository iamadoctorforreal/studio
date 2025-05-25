import { Storage } from '@google-cloud/storage';
import * as path from 'path';
import * as fs from 'fs';

const storage = new Storage();
const bucketName = process.env.GCS_AUDIO_BUCKET_NAME;

export class StorageService {
  private static instance: StorageService;
  private constructor() {}

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  async uploadFile(localFilePath: string, destinationFolder: string = 'audio'): Promise<string> {
    try {
      const bucket = storage.bucket(bucketName!);
      const filename = path.basename(localFilePath);
      const gcsPath = `${destinationFolder}/${filename}`;

      await bucket.upload(localFilePath, {
        destination: gcsPath,
        metadata: {
          contentType: this.getContentType(filename)
        }
      });

      return `gs://${bucketName}/${gcsPath}`;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async downloadFile(gcsUri: string, localPath: string): Promise<string> {
    try {
      const bucket = storage.bucket(bucketName!);
      const gcsPath = gcsUri.replace(`gs://${bucketName}/`, '');
      const file = bucket.file(gcsPath);

      await file.download({
        destination: localPath
      });

      return localPath;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.mp3':
        return 'audio/mpeg';
      case '.wav':
        return 'audio/wav';
      case '.srt':
        return 'application/x-subrip';
      default:
        return 'application/octet-stream';
    }
  }
}

export const storageService = StorageService.getInstance();