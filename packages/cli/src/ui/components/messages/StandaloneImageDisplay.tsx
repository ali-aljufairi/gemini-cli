/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import Image, {
  useTerminalInfo,
  useTerminalDimensions,
  type ImageProtocolName,
} from 'ink-picture';
import { theme } from '../../semantic-colors.js';
import type { ImageResult } from '@google/gemini-cli-core';
import * as path from 'node:path';

const IMAGE_LAYOUT = {
  // Leave horizontal padding so the image does not collide with borders/input.
  widthRatio: 0.8,
  height: {
    // Target portion of the viewport to use when we know the size.
    targetViewportRatio: 0.5,
    // Keep the image visible even in smaller terminals.
    minRows: 8,
    // Default when we cannot measure the viewport.
    fallbackRows: 24,
    // Reserve rows for prompts/status so we don't hide the input.
    reservedRowsForPrompt: 6,
  },
} as const;

export interface StandaloneImageDisplayProps {
  imageResult: ImageResult;
  terminalWidth: number;
  protocol?: ImageProtocolName | 'auto';
  /** Optional hard cap for image height (rows) when the parent needs it. */
  maxHeight?: number;
}

/**
 * Component for displaying images outside tool result boxes.
 * Uses full terminal width for better visibility and aspect ratio preservation.
 */
export const StandaloneImageDisplay: React.FC<StandaloneImageDisplayProps> = ({
  imageResult,
  terminalWidth,
  protocol = 'auto',
  maxHeight,
}) => {
  const [error, setError] = useState<string | null>(null);

  const imagePaths = useMemo(() => {
    const paths: string[] = [];
    for (const image of imageResult.images) {
      if (typeof image.filePath !== 'string' || image.filePath.length === 0) {
        setError('Image missing file path');
        return [];
      }
      paths.push(image.filePath);
    }
    setError(null);
    return paths;
  }, [imageResult]);

  const terminalInfo = useTerminalInfo();
  const terminalDimensions = useTerminalDimensions();

  const imageDimensions = useMemo(() => {
    // Calculate available width/height using terminal dimensions when possible.
    let availableWidth: number;
    let availableHeight: number;

    if (terminalDimensions) {
      const columns = Math.floor(
        terminalDimensions.viewportWidth / terminalDimensions.cellWidth,
      );
      const rows = Math.floor(
        terminalDimensions.viewportHeight / terminalDimensions.cellHeight,
      );
      availableWidth = columns;
      availableHeight =
        maxHeight !== undefined ? Math.min(maxHeight, rows) : rows;
    } else {
      availableWidth = terminalWidth;
      // Fallback height when we can't measure the viewport
      availableHeight =
        maxHeight !== undefined
          ? Math.min(maxHeight, IMAGE_LAYOUT.height.fallbackRows)
          : IMAGE_LAYOUT.height.fallbackRows;
    }

    // Let the image breathe horizontally; avoid the tool box constraints.
    const width = Math.max(
      10,
      Math.min(
        Math.floor(availableWidth * IMAGE_LAYOUT.widthRatio),
        availableWidth,
      ),
    );

    const cappedAvailableHeight =
      maxHeight !== undefined
        ? Math.min(maxHeight, availableHeight)
        : availableHeight;
    const usableHeight = Math.max(
      cappedAvailableHeight - IMAGE_LAYOUT.height.reservedRowsForPrompt,
      IMAGE_LAYOUT.height.minRows,
    );
    const targetHeight = Math.floor(
      cappedAvailableHeight * IMAGE_LAYOUT.height.targetViewportRatio,
    );
    const height = Math.max(
      Math.min(targetHeight, usableHeight),
      IMAGE_LAYOUT.height.minRows,
    );

    return { width, height };
  }, [maxHeight, terminalDimensions, terminalWidth]);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color={theme.status.error}>[Image Error: {error}]</Text>
      </Box>
    );
  }

  if (imagePaths.length === 0) {
    return null;
  }

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
    <Box
      flexDirection="column"
      width="100%"
      marginTop={1}
      marginBottom={1}
      flexShrink={0}
    >
      {imagePaths.map((imagePath, index) => (
        <Box
          key={imagePath}
          flexDirection="column"
          marginBottom={1}
          width="100%"
          height={imageDimensions.height}
          alignItems="center"
          flexShrink={0}
        >
          <Image
            src={imagePath}
            width={imageDimensions.width}
            height={imageDimensions.height}
            alt={
              imageResult.images[index]?.alt ||
              path.basename(imageResult.images[index]?.filePath ?? '') ||
              `Image ${index + 1}`
            }
            protocol={protocol}
          />
        </Box>
      ))}
    </Box>
  );
};
