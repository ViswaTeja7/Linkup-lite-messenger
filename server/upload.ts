/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface UploadedFileResponse {
  url: string;
  fileName: string;
  fileSize: number;
  mediaType: 'image' | 'video' | 'voice' | 'document';
  duration?: number; // Voice note duration
  processingLogs: string[];
}

/**
 * Handles media storage (simulating MinIO S3 bucket uploads)
 * and processes files (simulating FFmpeg transcoding and compression).
 */
export function handleMediaUpload(
  base64Data: string,
  fileName: string,
  mimeType: string,
  durationSec?: number
): UploadedFileResponse {
  // Extract clean base64 string
  const base64Body = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Body, 'base64');
  const fileSize = buffer.length;

  // Determine media type
  let mediaType: 'image' | 'video' | 'voice' | 'document' = 'document';
  if (mimeType.startsWith('image/')) {
    mediaType = 'image';
  } else if (mimeType.startsWith('video/')) {
    mediaType = 'video';
  } else if (mimeType.startsWith('audio/') || mimeType.includes('voice')) {
    mediaType = 'voice';
  }

  // Create secure file name
  const extension = fileName.split('.').pop() || 'bin';
  const secureName = `${mediaType}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${extension}`;
  const filePath = path.join(UPLOADS_DIR, secureName);

  // Write file to disk
  fs.writeFileSync(filePath, buffer);
  console.log(`[MinIO Bucket] Saved ${secureName} (${fileSize} bytes) to disk.`);

  // Simulate FFmpeg processing logs
  const processingLogs: string[] = [];
  let duration = durationSec;

  if (mediaType === 'voice' || mediaType === 'video') {
    processingLogs.push(`[FFmpeg] Initialized stream processing for ${fileName}...`);
    processingLogs.push(`[FFmpeg] Detected format: ${mimeType}, size: ${(fileSize / 1024).toFixed(1)} KB`);
    
    if (mediaType === 'voice') {
      processingLogs.push('[FFmpeg] Transcoding raw audio codec to Opus (Ogg container) for optimized web streaming...');
      processingLogs.push('[FFmpeg] Applied acoustic filters: Silence removal & dynamic audio compression.');
      duration = duration || Math.max(2, Math.round(fileSize / 12000)); // estimate duration if not passed
      processingLogs.push(`[FFmpeg] Output compiled successfully. Voice note duration calibrated at ${duration}s.`);
    } else {
      processingLogs.push('[FFmpeg] Analyzing video tracks, adjusting keyframe interval (H.264 profile)...');
      processingLogs.push('[FFmpeg] Downscaling high-res video feed to 720p 30fps web-optimized MP4...');
      processingLogs.push('[FFmpeg] Faststart header flag applied to enable instant-play streaming.');
    }
    processingLogs.push('[FFmpeg] Completed processing successfully.');
  } else if (mediaType === 'image') {
    processingLogs.push(`[MinIO S3] Upload received for image: ${fileName}`);
    processingLogs.push(`[Sharp Optimization] Compressed image assets to WebP. Saved ${((fileSize - (fileSize * 0.4)) / 1024).toFixed(1)} KB.`);
  } else {
    processingLogs.push(`[MinIO S3] Registered document chunk upload: ${fileName}`);
    processingLogs.push('[MinIO S3] Saved metadata & configured secure public access-control rule.');
  }

  // File URL served statically by express server
  const url = `/uploads/${secureName}`;

  return {
    url,
    fileName,
    fileSize,
    mediaType,
    duration,
    processingLogs
  };
}
