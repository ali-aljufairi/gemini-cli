/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import type { ImageProtocolName } from 'ink-picture';
import type { ImageResult } from '@google/gemini-cli-core';
import { StandaloneImageDisplay } from './StandaloneImageDisplay.js';

export interface ImageDisplayProps {
  /** Image result containing image file paths */
  imageResult: ImageResult;
  /** Maximum width in terminal columns (used as terminalWidth fallback) */
  maxWidth?: number;
  /** Maximum height in terminal rows */
  maxHeight?: number;
  /** Protocol to use for rendering (defaults to 'auto' for best quality) */
  protocol?: ImageProtocolName | 'auto';
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({
  imageResult,
  maxWidth,
  maxHeight,
  protocol = 'auto',
}) => {
  const terminalWidth = maxWidth ?? 80;
  return (
    <StandaloneImageDisplay
      imageResult={imageResult}
      terminalWidth={terminalWidth}
      maxHeight={maxHeight}
      protocol={protocol}
    />
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
        'filePath' in img &&
        'mimeType' in img,
    )
  );
}
