import { z } from 'zod';
import { 
  AspectRatio, 
  PersonGenerationTextToVideo, 
  PersonGenerationImageToVideo 
} from './veo.js';

/**
 * Zod schema for aspect ratio
 */
export const AspectRatioSchema = z.enum(['16:9', '9:16']);

/**
 * Zod schema for person generation in text-to-video
 */
export const PersonGenerationTextToVideoSchema = z.enum(['dont_allow', 'allow_adult']);

/**
 * Zod schema for person generation in image-to-video
 */
export const PersonGenerationImageToVideoSchema = z.literal('dont_allow');

/**
 * Zod schema for base video generation configuration
 */
export const BaseVideoGenerationConfigSchema = z.object({
  aspectRatio: AspectRatioSchema.optional(),
  numberOfVideos: z.union([z.literal(1), z.literal(2)]).optional(),
  durationSeconds: z.number().min(5).max(8).optional(),
  enhancePrompt: z.boolean().optional(),
  negativePrompt: z.string().optional(),
});

/**
 * Zod schema for text-to-video generation configuration
 */
export const TextToVideoGenerationConfigSchema = BaseVideoGenerationConfigSchema.extend({
  personGeneration: PersonGenerationTextToVideoSchema.optional(),
});

/**
 * Zod schema for image-to-video generation configuration
 */
export const ImageToVideoGenerationConfigSchema = BaseVideoGenerationConfigSchema.extend({
  personGeneration: PersonGenerationImageToVideoSchema.optional(),
});

/**
 * Zod schema for text-to-video generation input
 */
export const TextToVideoInputSchema = z.object({
  prompt: z.string().min(1).max(1000),
  config: TextToVideoGenerationConfigSchema.optional(),
});

/**
 * Zod schema for image-to-video generation input
 */
export const ImageToVideoInputSchema = z.object({
  prompt: z.string().min(1).max(1000).optional(),
  image: z.string().min(1),
  config: ImageToVideoGenerationConfigSchema.optional(),
});

/**
 * Type for stored video metadata
 */
export interface StoredVideoMetadata {
  id: string;
  createdAt: string;
  prompt?: string;
  config: {
    aspectRatio: AspectRatio;
    personGeneration: PersonGenerationTextToVideo | PersonGenerationImageToVideo;
    durationSeconds: number;
  };
  mimeType: string;
  size: number;
}

/**
 * Type for video resource URI parameters
 */
export interface VideoResourceParams {
  id: string;
}
