/**
 * POST /synopsis/tts - Convert text to speech using ElevenLabs
 *
 * Uses the ElevenLabs API to generate audio from text.
 * Returns base64-encoded MP3 audio data.
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automaker/utils';
import { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('SynopsisTTS');

// ElevenLabs API configuration
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
// Default voice: Rachel (a clear, professional voice)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/**
 * Request body for the TTS endpoint
 */
interface TTSRequestBody {
  text: string;
  voiceId?: string;
}

/**
 * Success response from the TTS endpoint
 */
interface TTSSuccessResponse {
  success: true;
  audioData: string; // base64 encoded MP3
}

/**
 * Error response from the TTS endpoint
 */
interface TTSErrorResponse {
  success: false;
  error: string;
}

/**
 * Create the TTS request handler
 */
export function createTTSHandler(): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { text, voiceId } = req.body as TTSRequestBody;

      // Validate required fields
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        const response: TTSErrorResponse = {
          success: false,
          error: 'text is required and must be a non-empty string',
        };
        res.status(400).json(response);
        return;
      }

      // Get ElevenLabs API key from credentials
      const settingsService = SettingsService.getInstance();
      const credentials = await settingsService.getCredentials();
      const apiKey = credentials?.apiKeys?.elevenLabs;

      if (!apiKey) {
        logger.warn('ElevenLabs API key not configured');
        const response: TTSErrorResponse = {
          success: false,
          error: 'ElevenLabs API key not configured. Please add your API key in Settings.',
        };
        res.status(400).json(response);
        return;
      }

      const selectedVoiceId = voiceId || DEFAULT_VOICE_ID;
      logger.info(`Generating TTS for ${text.length} chars with voice ${selectedVoiceId}`);

      // Call ElevenLabs API
      const elevenLabsResponse = await fetch(`${ELEVENLABS_API_URL}/${selectedVoiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text.trim(),
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!elevenLabsResponse.ok) {
        const errorText = await elevenLabsResponse.text();
        logger.error(`ElevenLabs API error: ${elevenLabsResponse.status} - ${errorText}`);

        let errorMessage = 'Failed to generate audio';
        if (elevenLabsResponse.status === 401) {
          errorMessage = 'Invalid ElevenLabs API key. Please check your API key in Settings.';
        } else if (elevenLabsResponse.status === 429) {
          errorMessage = 'ElevenLabs rate limit exceeded. Please try again later.';
        }

        const response: TTSErrorResponse = {
          success: false,
          error: errorMessage,
        };
        res.status(elevenLabsResponse.status).json(response);
        return;
      }

      // Get the audio data as an ArrayBuffer and convert to base64
      const audioBuffer = await elevenLabsResponse.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');

      logger.info(`TTS generated successfully, audio size: ${audioBuffer.byteLength} bytes`);

      const response: TTSSuccessResponse = {
        success: true,
        audioData: base64Audio,
      };
      res.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error('TTS generation failed:', errorMessage);

      const response: TTSErrorResponse = {
        success: false,
        error: errorMessage,
      };
      res.status(500).json(response);
    }
  };
}
