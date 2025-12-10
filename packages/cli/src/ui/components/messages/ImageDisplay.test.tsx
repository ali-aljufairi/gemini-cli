/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { ImageDisplay, isImageResult } from './ImageDisplay.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Box, Text } from 'ink';
import type { ImageResult } from '@google/gemini-cli-core';

// Mock ink-picture components
vi.mock('ink-picture', () => ({
  default: ({
    src,
    width,
    height,
    alt,
    protocol,
  }: {
    src: string;
    width?: number;
    height?: number;
    alt?: string;
    protocol?: string;
  }) => (
    <Box>
      <Text>
        Image: {src} (w:{width} h:{height} alt:{alt} protocol:{protocol})
      </Text>
    </Box>
  ),
  useTerminalInfo: vi.fn(),
  useTerminalDimensions: vi.fn(),
}));

// Import after mocks
import { useTerminalInfo, useTerminalDimensions } from 'ink-picture';

describe('ImageDisplay', () => {
  const mockUseTerminalInfo = useTerminalInfo as ReturnType<typeof vi.fn>;
  const mockUseTerminalDimensions = useTerminalDimensions as ReturnType<
    typeof vi.fn
  >;

  const createMockImageResult = (
    count: number = 1,
    alt?: string,
  ): ImageResult => ({
    images: Array.from({ length: count }, (_, i) => ({
      filePath: `/tmp/mock-image-${i}.png`,
      mimeType: 'image/png',
      alt: alt || `Test image ${i + 1}`,
    })),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTerminalInfo.mockReturnValue({
      dimensions: { columns: 100, rows: 50 },
      capabilities: { supportsColor: true, supportsUnicode: true },
    });
    mockUseTerminalDimensions.mockReturnValue({
      columns: 100,
      rows: 50,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders single image with default settings', () => {
    const imageResult = createMockImageResult(1);
    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('/tmp/mock-image-0.png');
  });

  it('renders multiple images', () => {
    const imageResult = createMockImageResult(3);
    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('/tmp/mock-image-0.png');
    expect(output).toContain('/tmp/mock-image-1.png');
    expect(output).toContain('/tmp/mock-image-2.png');
  });

  it('uses custom maxWidth and maxHeight', () => {
    const imageResult = createMockImageResult(1);
    const { lastFrame } = render(
      <ImageDisplay imageResult={imageResult} maxWidth={120} maxHeight={60} />,
    );
    const output = lastFrame();

    expect(output).toContain('w:120 h:60');
  });

  it('uses custom protocol', () => {
    const imageResult = createMockImageResult(1);
    const { lastFrame } = render(
      <ImageDisplay imageResult={imageResult} protocol="halfBlock" />,
    );
    const output = lastFrame();

    expect(output).toContain('protocol:halfBlock');
  });

  it('uses auto protocol by default', () => {
    const imageResult = createMockImageResult(1);
    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('protocol:auto');
  });

  it('displays error message when image processing fails', () => {
    const imageResult: ImageResult = {
      images: [
        {
          filePath: '',
          mimeType: 'image/png',
        },
      ],
    };
    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('Image Error');
  });

  it('displays file paths when terminal info is not available', () => {
    mockUseTerminalInfo.mockReturnValue(undefined);
    mockUseTerminalDimensions.mockReturnValue(undefined);

    const imageResult = createMockImageResult(1);
    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('Image saved');
  });

  it('displays alt text when available', () => {
    const imageResult = createMockImageResult(1, 'Custom alt text');
    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('Custom alt text');
  });

  it('handles different image mime types', () => {
    const imageResult: ImageResult = {
      images: [
        {
          filePath: '/tmp/jpeg-image.jpg',
          mimeType: 'image/jpeg',
          alt: 'JPEG image',
        },
        {
          filePath: '/tmp/png-image.png',
          mimeType: 'image/png',
          alt: 'PNG image',
        },
      ],
    };

    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('/tmp/jpeg-image.jpg');
    expect(output).toContain('/tmp/png-image.png');
  });

  it('calculates dynamic sizing based on terminal dimensions', () => {
    mockUseTerminalDimensions.mockReturnValue({
      columns: 200,
      rows: 100,
    });

    const imageResult = createMockImageResult(1);
    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('w:160');
  });

  it('handles empty image result gracefully', () => {
    const imageResult: ImageResult = {
      images: [],
    };

    const { lastFrame } = render(<ImageDisplay imageResult={imageResult} />);
    const output = lastFrame();

    expect(output).toContain('No images to display');
  });
});

describe('isImageResult', () => {
  it('returns true for valid ImageResult', () => {
    const validResult: ImageResult = {
      images: [
        {
          filePath: '/tmp/valid-image.png',
          mimeType: 'image/png',
        },
      ],
    };

    expect(isImageResult(validResult)).toBe(true);
  });

  it('returns false for invalid objects', () => {
    expect(isImageResult(null)).toBe(false);
    expect(isImageResult(undefined)).toBe(false);
    expect(isImageResult({})).toBe(false);
    expect(isImageResult({ images: [] })).toBe(false);
    expect(isImageResult({ images: [{}] })).toBe(false);
    expect(isImageResult('string')).toBe(false);
    expect(isImageResult(123)).toBe(false);
  });

  it('returns false for objects with invalid image structure', () => {
    expect(
      isImageResult({
        images: [{ filePath: '/tmp/img.png' }], // missing mimeType
      }),
    ).toBe(false);

    expect(
      isImageResult({
        images: [{ mimeType: 'image/png' }], // missing filePath
      }),
    ).toBe(false);
  });
});
