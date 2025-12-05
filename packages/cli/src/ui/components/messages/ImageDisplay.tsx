/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Image, { useTerminalInfo, type ImageProtocolName } from 'ink-picture';
import { theme } from '../../semantic-colors.js';
import type { ImageResult } from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ImageDisplayProps {
  /** Image result containing base64 image data */
  imageResult: ImageResult;
  /** Maximum width in terminal columns */
  maxWidth?: number;
  /** Maximum height in terminal rows */
  maxHeight?: number;
  /** Protocol to use for rendering (defaults to halfBlock for compatibility) */
  protocol?: ImageProtocolName;
}

/**
 * Component for displaying images inline in the terminal.
 *
 * Uses ink-picture to render images using the specified protocol.
 * Default protocol is 'halfBlock' which works in most terminals
 * without requiring escape sequence queries.
 */
export const ImageDisplay: React.FC<ImageDisplayProps> = ({
  imageResult,
  maxWidth = 60,
  maxHeight = 30,
  protocol = 'halfBlock',
}) => {
  const [tempFiles, setTempFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const terminalInfo = useTerminalInfo();

  // Create temporary files from base64 data
  const imagePaths = useMemo(() => {
    try {
      const paths: string[] = [];
      const tmpDir = os.tmpdir();

      for (let i = 0; i < imageResult.images.length; i++) {
        const image = imageResult.images[i];
        const extension = image.mimeType.split('/')[1] || 'png';
        const filename = `gemini-cli-image-${Date.now()}-${i}.${extension}`;
        const filepath = path.join(tmpDir, filename);

        // Decode base64 and write to temp file
        const buffer = Buffer.from(image.data, 'base64');
        fs.writeFileSync(filepath, buffer);
        paths.push(filepath);
      }

      setTempFiles(paths);
      setError(null);
      return paths;
    } catch (err) {
      setError(
        `Failed to process image data: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }, [imageResult]);

  // Cleanup temp files on unmount
  useEffect(() => () => {
      for (const file of tempFiles) {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }, [tempFiles]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color={theme.status.error}>[Image Error: {error}]</Text>
      </Box>
    );
  }

  if (imagePaths.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={theme.text.secondary}>[No images to display]</Text>
      </Box>
    );
  }

  // Get alt text from first image if available
  const altText = imageResult.images[0]?.alt;

  // If terminal info is not yet available, show file paths
  if (!terminalInfo) {
    return (
      <Box flexDirection="column">
        {imagePaths.map((imagePath) => (
          <Text key={imagePath} color={theme.text.link}>
            📷 Image saved: {imagePath}
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {imagePaths.map((imagePath, index) => (
        <Box key={imagePath} flexDirection="column">
          <Image
            src={imagePath}
            width={maxWidth}
            height={maxHeight}
            alt={imageResult.images[index]?.alt || `Image ${index + 1}`}
            protocol={protocol}
          />
        </Box>
      ))}
      {altText && (
        <Text color={theme.text.secondary} dimColor>
          {altText}
        </Text>
      )}
    </Box>
  );
};

/**
 * Type guard to check if a ToolResultDisplay is an ImageResult
 */
export function isImageResult(display: unknown): display is ImageResult {
  return (
    typeof display === 'object' &&
    display !== null &&
    'images' in display &&
    Array.isArray((display as ImageResult).images) &&
    (display as ImageResult).images.length > 0 &&
    (display as ImageResult).images.every(
      (img) =>
        typeof img === 'object' &&
        img !== null &&
        'data' in img &&
        'mimeType' in img,
    )
  );
}
