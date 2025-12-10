/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ImageResult } from '@google/gemini-cli-core';

const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
];
const MIME_TYPE_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

/**
 * Checks if a file path has an image extension
 */
export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Gets MIME type for an image file based on extension
 */
export function getImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPE_MAP[ext] || 'image/png';
}

/**
 * Extracts image file paths from text that contains @path references
 * Returns an array of image paths found in the text
 */
export function extractImagePaths(
  text: string,
  workspaceRoot: string,
): string[] {
  const imagePaths: string[] = [];
  const atPathRegex = /@([^\s,;!?()[\]{}]+\.(png|jpg|jpeg|gif|webp|bmp|svg))/gi;
  let match;

  while ((match = atPathRegex.exec(text)) !== null) {
    const imagePath = match[1];
    // Resolve relative paths
    const resolvedPath = path.isAbsolute(imagePath)
      ? imagePath
      : path.resolve(workspaceRoot, imagePath);
    if (isImageFile(resolvedPath)) {
      imagePaths.push(resolvedPath);
    }
  }

  return imagePaths;
}

/**
 * Reads image files and converts them to ImageResult format
 */
export async function readImagesAsImageResult(
  imagePaths: string[],
): Promise<ImageResult | null> {
  if (imagePaths.length === 0) {
    return null;
  }

  const images = [];

  for (const imagePath of imagePaths) {
    try {
      await fs.access(imagePath);
      const mimeType = getImageMimeType(imagePath);
      const fileName = path.basename(imagePath);

      images.push({
        filePath: imagePath,
        mimeType,
        alt: fileName,
      });
    } catch {
      // Skip images that can't be read
    }
  }

  if (images.length === 0) {
    return null;
  }

  return { images };
}
