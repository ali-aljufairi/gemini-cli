/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import { theme } from '../../semantic-colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { isSlashCommand as checkIsSlashCommand } from '../../utils/commandUtils.js';
import {
  extractImagePaths,
  readImagesAsImageResult,
} from '../../utils/imageUtils.js';
import { ImageDisplay } from './ImageDisplay.js';

interface UserMessageProps {
  text: string;
  width: number;
  workspaceRoot?: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({
  text,
  width,
  workspaceRoot = process.cwd(),
}) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = checkIsSlashCommand(text);
  const [imageResult, setImageResult] = useState<Awaited<
    ReturnType<typeof readImagesAsImageResult>
  > | null>(null);

  const textColor = isSlashCommand ? theme.text.accent : theme.text.secondary;

  useEffect(() => {
    const imagePaths = extractImagePaths(text, workspaceRoot);
    if (imagePaths.length > 0) {
      readImagesAsImageResult(imagePaths)
        .then((result) => {
          setImageResult(result);
        })
        .catch(() => {
          setImageResult(null);
        });
    } else {
      setImageResult(null);
    }
  }, [text, workspaceRoot]);

  return (
    <Box flexDirection="column" width={width} marginY={1}>
      {imageResult && (
        <Box marginBottom={1}>
          <ImageDisplay
            imageResult={imageResult}
            maxWidth={Math.floor(width * 0.8)}
          />
        </Box>
      )}
      <Box
        flexDirection="row"
        paddingY={0}
        alignSelf="flex-start"
        width={width}
      >
        <Box width={prefixWidth} flexShrink={0}>
          <Text
            color={theme.text.accent}
            aria-label={SCREEN_READER_USER_PREFIX}
          >
            {prefix}
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text wrap="wrap" color={textColor}>
            {text}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
