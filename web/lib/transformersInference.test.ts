import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTextWithMiniCPM, PipelineSingleton, formatMiniCPMPrompt } from './transformersInference';

vi.mock('@huggingface/transformers', () => {
  return {
    env: {
      allowLocalModels: true,
      useBrowserCache: true,
    },
    pipeline: vi.fn(),
  };
});

import { pipeline } from '@huggingface/transformers';

describe('transformersInference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PipelineSingleton.instance = null;
  });

  describe('formatMiniCPMPrompt', () => {
    it('should format correctly and truncate long inputs', () => {
      const shortText = 'hello world';
      const prompt = formatMiniCPMPrompt(shortText);
      expect(prompt).toContain('<|system|>\n');
      expect(prompt).toContain('hello world');

      const longText = 'a'.repeat(3000);
      const longPrompt = formatMiniCPMPrompt(longText);
      expect(longPrompt).toContain('a'.repeat(2000));
      expect(longPrompt).not.toContain('a'.repeat(2001));
    });
  });

  describe('extractTextWithMiniCPM', () => {
    it('should return empty string for empty inputs', async () => {
      expect(await extractTextWithMiniCPM('')).toBe('');
      expect(await extractTextWithMiniCPM('   ')).toBe('');
      expect(pipeline).not.toHaveBeenCalled();
    });

    it('should handle successful extraction', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([
        { generated_text: '<|system|>\nYou are a specialized data extraction assistant. Extract the requested information accurately.\n<|user|>\nextract this\n<|assistant|>\nExtracted output' }
      ]);
      (pipeline as any).mockResolvedValue(mockGenerator);

      const result = await extractTextWithMiniCPM('extract this');
      expect(result).toBe('Extracted output');
    });

    it('should handle progress callbacks', async () => {
      const mockGenerator = vi.fn().mockResolvedValue([{ generated_text: 'output' }]);
      (pipeline as any).mockResolvedValue(mockGenerator);
      const progressCb = vi.fn();

      await extractTextWithMiniCPM('test', progressCb);
      expect(pipeline).toHaveBeenCalledWith(
        'text-generation',
        'Xenova/MiniCPM-5',
        expect.objectContaining({ progress_callback: progressCb })
      );
    });

    it('should handle pipeline failure fallbacks', async () => {
      const mockGenerator = vi.fn().mockRejectedValue(new Error('Pipeline error'));
      (pipeline as any).mockResolvedValue(mockGenerator);

      const result = await extractTextWithMiniCPM('failing text');
      expect(result).toBe('Fallback: Could not extract data.');
    });
  });
});
