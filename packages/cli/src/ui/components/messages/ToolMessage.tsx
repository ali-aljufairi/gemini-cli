/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { IndividualToolCallDisplay } from '../../types.js';
import { StickyHeader } from '../StickyHeader.js';
import { ToolResultDisplay } from './ToolResultDisplay.js';
import { StandaloneImageDisplay } from './StandaloneImageDisplay.js';
import { isImageResult } from './ImageDisplay.js';
import {
  ToolStatusIndicator,
  ToolInfo,
  TrailingIndicator,
  type TextEmphasis,
  STATUS_INDICATOR_WIDTH,
} from './ToolShared.js';
import {
  SHELL_COMMAND_NAME,
  SHELL_FOCUS_HINT_DELAY_MS,
} from '../../constants.js';
import { theme } from '../../semantic-colors.js';
import type { Config, ImageResult } from '@google/gemini-cli-core';
import { useInactivityTimer } from '../../hooks/useInactivityTimer.js';
import { ToolCallStatus } from '../../types.js';
import { ShellInputPrompt } from '../ShellInputPrompt.js';

export type { TextEmphasis };

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight?: number;
  terminalWidth: number;
  emphasis?: TextEmphasis;
  renderOutputAsMarkdown?: boolean;
  isFirst: boolean;
  borderColor: string;
  borderDimColor: boolean;
  activeShellPtyId?: number | null;
  embeddedShellFocused?: boolean;
  ptyId?: number;
  config?: Config;
}

const IMAGE_MIN_ROWS = 10;
const RESERVED_ROWS_FOR_BOX_CHROME = 5; // header, borders, padding inside the message box

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  availableTerminalHeight,
  terminalWidth,
  emphasis = 'medium',
  renderOutputAsMarkdown = true,
  isFirst,
  borderColor,
  borderDimColor,
  activeShellPtyId,
  embeddedShellFocused,
  ptyId,
  config,
}) => {
  const isThisShellFocused =
    (name === SHELL_COMMAND_NAME || name === 'Shell') &&
    status === ToolCallStatus.Executing &&
    ptyId === activeShellPtyId &&
    embeddedShellFocused;

  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [userHasFocused, setUserHasFocused] = useState(false);
  const showFocusHint = useInactivityTimer(
    !!lastUpdateTime,
    lastUpdateTime ? lastUpdateTime.getTime() : 0,
    SHELL_FOCUS_HINT_DELAY_MS,
  );

  useEffect(() => {
    if (resultDisplay) {
      setLastUpdateTime(new Date());
    }
  }, [resultDisplay]);

  useEffect(() => {
    if (isThisShellFocused) {
      setUserHasFocused(true);
    }
  }, [isThisShellFocused]);

  const isThisShellFocusable =
    (name === SHELL_COMMAND_NAME || name === 'Shell') &&
    status === ToolCallStatus.Executing &&
    config?.getEnableInteractiveShell();

  const shouldShowFocusHint =
    isThisShellFocusable && (showFocusHint || userHasFocused);

  const isImage = isImageResult(resultDisplay);
  const imageResult = isImage ? (resultDisplay as ImageResult) : null;
  const textContent =
    isImage && imageResult?.images[0]?.alt
      ? imageResult.images[0].alt
      : resultDisplay;
  const imageMaxHeight = useMemo(() => {
    if (availableTerminalHeight === undefined) return undefined;
    return Math.max(
      availableTerminalHeight - RESERVED_ROWS_FOR_BOX_CHROME,
      IMAGE_MIN_ROWS,
    );
  }, [availableTerminalHeight]);

  return (
    <>
      <Box flexDirection="column" width={terminalWidth}>
        <StickyHeader
          width={terminalWidth}
          isFirst={isFirst}
          borderColor={borderColor}
          borderDimColor={borderDimColor}
        >
          <ToolStatusIndicator status={status} name={name} />
          <ToolInfo
            name={name}
            status={status}
            description={description}
            emphasis={emphasis}
          />
          {shouldShowFocusHint && (
            <Box marginLeft={1} flexShrink={0}>
              <Text color={theme.text.accent}>
                {isThisShellFocused ? '(Focused)' : '(ctrl+f to focus)'}
              </Text>
            </Box>
          )}
          {emphasis === 'high' && <TrailingIndicator />}
        </StickyHeader>
        <Box
          width={terminalWidth}
          borderStyle="round"
          borderColor={borderColor}
          borderDimColor={borderDimColor}
          borderTop={false}
          borderBottom={false}
          borderLeft={true}
          borderRight={true}
          paddingX={1}
          flexDirection="column"
          alignItems="flex-start"
        >
          <ToolResultDisplay
            resultDisplay={textContent}
            availableTerminalHeight={availableTerminalHeight}
            terminalWidth={terminalWidth}
            renderOutputAsMarkdown={renderOutputAsMarkdown}
          />
          {isThisShellFocused && config && (
            <Box paddingLeft={STATUS_INDICATOR_WIDTH} marginTop={1}>
              <ShellInputPrompt
                activeShellPtyId={activeShellPtyId ?? null}
                focus={embeddedShellFocused}
              />
            </Box>
          )}
        </Box>
      </Box>
      {isImage && imageResult && (
        <Box
          width={terminalWidth}
          marginTop={1}
          marginBottom={1}
          flexShrink={0}
        >
          <StandaloneImageDisplay
            imageResult={imageResult}
            terminalWidth={Math.max(terminalWidth - 2, 10)}
            maxHeight={imageMaxHeight}
          />
        </Box>
      )}
    </>
  );
};
