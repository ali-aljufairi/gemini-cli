/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolMcpConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
  ImageResult,
} from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolConfirmationOutcome,
} from './tools.js';
import type { CallableTool, FunctionCall, Part } from '@google/genai';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

type ToolParams = Record<string, unknown>;

// Discriminated union for MCP Content Blocks to ensure type safety.
type McpTextBlock = {
  type: 'text';
  text: string;
};

type McpMediaBlock = {
  type: 'image' | 'audio';
  mimeType: string;
  filePath?: string;
  uri?: string;
  // audio/image tools previously returned base64; no longer used for images.
  data?: string;
};

type McpResourceBlock = {
  type: 'resource';
  resource: {
    text?: string;
    blob?: string;
    mimeType?: string;
  };
};

type McpResourceLinkBlock = {
  type: 'resource_link';
  uri: string;
  title?: string;
  name?: string;
};

type McpContentBlock =
  | McpTextBlock
  | McpMediaBlock
  | McpResourceBlock
  | McpResourceLinkBlock;

class DiscoveredMCPToolInvocation extends BaseToolInvocation<
  ToolParams,
  ToolResult
> {
  private static readonly allowlist: Set<string> = new Set();

  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly serverToolName: string,
    readonly displayName: string,
    readonly trust?: boolean,
    params: ToolParams = {},
    private readonly cliConfig?: Config,
    messageBus?: MessageBus,
  ) {
    // Use composite format for policy checks: serverName__toolName
    // This enables server wildcards (e.g., "google-workspace__*")
    // while still allowing specific tool rules

    super(
      params,
      messageBus,
      `${serverName}__${serverToolName}`,
      displayName,
      serverName,
    );
  }

  protected override async getConfirmationDetails(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const serverAllowListKey = this.serverName;
    const toolAllowListKey = `${this.serverName}.${this.serverToolName}`;

    if (this.cliConfig?.isTrustedFolder() && this.trust) {
      return false; // server is trusted, no confirmation needed
    }

    if (
      DiscoveredMCPToolInvocation.allowlist.has(serverAllowListKey) ||
      DiscoveredMCPToolInvocation.allowlist.has(toolAllowListKey)
    ) {
      return false; // server and/or tool already allowlisted
    }

    const confirmationDetails: ToolMcpConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool Execution',
      serverName: this.serverName,
      toolName: this.serverToolName, // Display original tool name in confirmation
      toolDisplayName: this.displayName, // Display global registry name exposed to model and user
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
          DiscoveredMCPToolInvocation.allowlist.add(serverAllowListKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
          DiscoveredMCPToolInvocation.allowlist.add(toolAllowListKey);
        }
      },
    };
    return confirmationDetails;
  }

  // Determine if the response contains tool errors
  // This is needed because CallToolResults should return errors inside the response.
  // ref: https://modelcontextprotocol.io/specification/2025-06-18/schema#calltoolresult
  isMCPToolError(rawResponseParts: Part[]): boolean {
    const functionResponse = rawResponseParts?.[0]?.functionResponse;
    const response = functionResponse?.response;

    interface McpError {
      isError?: boolean | string;
    }

    if (response) {
      const error = (response as { error?: McpError })?.error;
      const isError = error?.isError;

      if (error && (isError === true || isError === 'true')) {
        return true;
      }
    }
    return false;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const functionCalls: FunctionCall[] = [
      {
        name: this.serverToolName,
        args: this.params,
      },
    ];

    // Race MCP tool call with abort signal to respect cancellation
    const rawResponseParts = await new Promise<Part[]>((resolve, reject) => {
      if (signal.aborted) {
        const error = new Error('Tool call aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }
      const onAbort = () => {
        cleanup();
        const error = new Error('Tool call aborted');
        error.name = 'AbortError';
        reject(error);
      };
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
      };
      signal.addEventListener('abort', onAbort, { once: true });

      this.mcpTool
        .callTool(functionCalls)
        .then((res) => {
          cleanup();
          resolve(res);
        })
        .catch((err) => {
          cleanup();
          reject(err);
        });
    });

    // Ensure the response is not an error
    if (this.isMCPToolError(rawResponseParts)) {
      const errorMessage = `MCP tool '${
        this.serverToolName
      }' reported tool error for function call: ${safeJsonStringify(
        functionCalls[0],
      )} with response: ${safeJsonStringify(rawResponseParts)}`;
      return {
        llmContent: errorMessage,
        returnDisplay: `Error: MCP tool '${this.serverToolName}' reported an error.`,
        error: {
          message: errorMessage,
          type: ToolErrorType.MCP_TOOL_ERROR,
        },
      };
    }

    const transformedParts = transformMcpContentToParts(rawResponseParts);

    return {
      llmContent: transformedParts,
      returnDisplay: getStringifiedResultForDisplay(rawResponseParts),
    };
  }

  getDescription(): string {
    return safeJsonStringify(this.params);
  }
}

export class DiscoveredMCPTool extends BaseDeclarativeTool<
  ToolParams,
  ToolResult
> {
  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly serverToolName: string,
    description: string,
    override readonly parameterSchema: unknown,
    readonly trust?: boolean,
    nameOverride?: string,
    private readonly cliConfig?: Config,
    override readonly extensionName?: string,
    override readonly extensionId?: string,
    messageBus?: MessageBus,
  ) {
    super(
      nameOverride ?? generateValidName(serverToolName),
      `${serverToolName} (${serverName} MCP Server)`,
      description,
      Kind.Other,
      parameterSchema,
      true, // isOutputMarkdown
      false, // canUpdateOutput,
      messageBus,
      extensionName,
      extensionId,
    );
  }

  getFullyQualifiedPrefix(): string {
    return `${this.serverName}__`;
  }

  asFullyQualifiedTool(): DiscoveredMCPTool {
    return new DiscoveredMCPTool(
      this.mcpTool,
      this.serverName,
      this.serverToolName,
      this.description,
      this.parameterSchema,
      this.trust,
      `${this.getFullyQualifiedPrefix()}${this.serverToolName}`,
      this.cliConfig,
      this.extensionName,
      this.extensionId,
      this.messageBus,
    );
  }

  protected createInvocation(
    params: ToolParams,
    _messageBus?: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<ToolParams, ToolResult> {
    return new DiscoveredMCPToolInvocation(
      this.mcpTool,
      this.serverName,
      this.serverToolName,
      this.displayName,
      this.trust,
      params,
      this.cliConfig,
      _messageBus,
    );
  }
}

function transformTextBlock(block: McpTextBlock): Part {
  return { text: block.text };
}

function transformImageAudioBlock(
  block: McpMediaBlock,
  toolName: string,
): Part[] {
  const fileUri =
    block.filePath && block.filePath.startsWith('file://')
      ? block.filePath
      : block.filePath
        ? `file://${block.filePath}`
        : block.uri;
  const hasInlineData = typeof block.data === 'string' && block.data.length > 0;

  return [
    {
      text: `[Tool '${toolName}' provided the following ${
        block.type
      } data with mime-type: ${block.mimeType}]`,
    },
    fileUri
      ? {
          fileData: {
            fileUri,
            mimeType: block.mimeType,
          },
        }
      : hasInlineData
        ? {
            inlineData: {
              mimeType: block.mimeType,
              data: block.data!,
            },
          }
        : { text: '[No image payload provided]' },
  ];
}

function transformResourceBlock(
  block: McpResourceBlock,
  toolName: string,
): Part | Part[] | null {
  const resource = block.resource;
  if (resource?.text) {
    return { text: resource.text };
  }
  if (resource?.blob) {
    const mimeType = resource.mimeType || 'application/octet-stream';
    return [
      {
        text: `[Tool '${toolName}' provided the following embedded resource with mime-type: ${mimeType}]`,
      },
      {
        inlineData: {
          mimeType,
          data: resource.blob,
        },
      },
    ];
  }
  return null;
}

function transformResourceLinkBlock(block: McpResourceLinkBlock): Part {
  return {
    text: `Resource Link: ${block.title || block.name} at ${block.uri}`,
  };
}

/**
 * Transforms the raw MCP content blocks from the SDK response into a
 * standard GenAI Part array.
 * @param sdkResponse The raw Part[] array from `mcpTool.callTool()`.
 * @returns A clean Part[] array ready for the scheduler.
 */
function transformMcpContentToParts(sdkResponse: Part[]): Part[] {
  const funcResponse = sdkResponse?.[0]?.functionResponse;
  const mcpContent = funcResponse?.response?.['content'] as McpContentBlock[];
  const toolName = funcResponse?.name || 'unknown tool';

  if (!Array.isArray(mcpContent)) {
    return [{ text: '[Error: Could not parse tool response]' }];
  }

  const transformed = mcpContent.flatMap(
    (block: McpContentBlock): Part | Part[] | null => {
      switch (block.type) {
        case 'text':
          return transformTextBlock(block);
        case 'image':
        case 'audio':
          return transformImageAudioBlock(block, toolName);
        case 'resource':
          return transformResourceBlock(block, toolName);
        case 'resource_link':
          return transformResourceLinkBlock(block);
        default:
          return null;
      }
    },
  );

  return transformed.filter((part): part is Part => part !== null);
}

/**
 * Processes the raw response from the MCP tool to generate a clean,
 * human-readable representation for display in the CLI.
 *
 * @param rawResponse The raw Part[] array from the GenAI SDK.
 * @returns A ToolResultDisplay: either a formatted string or ImageResult.
 */
function getStringifiedResultForDisplay(
  rawResponse: Part[],
): ToolResultDisplay {
  const mcpContent = rawResponse?.[0]?.functionResponse?.response?.[
    'content'
  ] as McpContentBlock[];

  if (!Array.isArray(mcpContent)) {
    return '```json\n' + JSON.stringify(rawResponse, null, 2) + '\n```';
  }

  const imageBlocks = mcpContent.filter(
    (block): block is McpMediaBlock =>
      block.type === 'image' &&
      'mimeType' in block &&
      (('filePath' in block && typeof block.filePath === 'string') ||
        ('uri' in block && typeof block.uri === 'string') ||
        ('data' in block && typeof block.data === 'string')),
  );

  if (imageBlocks.length > 0) {
    const textParts = mcpContent
      .filter((block): block is McpTextBlock => block.type === 'text')
      .map((block) => block.text);

    const images: ImageResult['images'] = imageBlocks
      .map((block, index) => {
        // Prefer filePath, then uri (stripping file:// prefix), then fallback to base64 temp file
        let filePath: string | undefined = undefined;

        if (block.filePath && typeof block.filePath === 'string') {
          filePath = block.filePath;
        } else if (block.uri && typeof block.uri === 'string') {
          // Strip file:// prefix if present
          filePath = block.uri.startsWith('file://')
            ? block.uri.replace('file://', '')
            : block.uri;
        }

        // If we have a file path, verify it exists and use it
        if (filePath) {
          try {
            // Verify file exists
            if (fs.existsSync(filePath)) {
              return {
                filePath,
                mimeType: block.mimeType,
                alt: textParts.length > 0 ? textParts.join('\n') : undefined,
              };
            } else {
              console.error(
                `Image file path does not exist: ${filePath}, falling back to base64`,
              );
            }
          } catch (err) {
            console.error(
              `Error checking image file path ${filePath}:`,
              err,
              'falling back to base64',
            );
          }
        }

        // Fallback: if only base64 data is present, materialize to a temp file.
        if (block.data && typeof block.data === 'string') {
          try {
            const extension = block.mimeType.split('/')[1] || 'png';
            const filename = `gemini-cli-image-mcp-${Date.now()}-${index}.${extension}`;
            const filepath = path.join(os.tmpdir(), filename);
            const buffer = Buffer.from(block.data, 'base64');
            fs.writeFileSync(filepath, buffer);
            return {
              filePath: filepath,
              mimeType: block.mimeType,
              alt: textParts.length > 0 ? textParts.join('\n') : undefined,
            };
          } catch (err) {
            console.error('Failed to write image temp file from MCP data', err);
            return null;
          }
        }

        console.error(
          `Image block ${index} has no valid filePath, uri, or data field`,
        );
        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (images.length > 0) {
      const imageResult: ImageResult = { images };
      return imageResult;
    }
  }
  const displayParts = mcpContent.map((block: McpContentBlock): string => {
    switch (block.type) {
      case 'text':
        return block.text;
      case 'image':
        return `[Image: ${block.mimeType}]`;
      case 'audio':
        return `[Audio: ${block.mimeType}]`;
      case 'resource_link':
        return `[Link to ${block.title || block.name}: ${block.uri}]`;
      case 'resource':
        if (block.resource?.text) {
          return block.resource.text;
        }
        return `[Embedded Resource: ${
          block.resource?.mimeType || 'unknown type'
        }]`;
      default:
        return `[Unknown content type: ${(block as { type: string }).type}]`;
    }
  });

  return displayParts.join('\n');
}

/** Visible for testing */
export function generateValidName(name: string) {
  // Replace invalid characters (based on 400 error message from Gemini API) with underscores
  let validToolname = name.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // If longer than 63 characters, replace middle with '___'
  // (Gemini API says max length 64, but actual limit seems to be 63)
  if (validToolname.length > 63) {
    validToolname =
      validToolname.slice(0, 28) + '___' + validToolname.slice(-32);
  }
  return validToolname;
}
