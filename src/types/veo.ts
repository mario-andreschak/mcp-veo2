/**
 * Type definitions for Google's Veo2 video generation API
 */

/**
 * Aspect ratio options for generated videos
 */
export type AspectRatio = '16:9' | '9:16';

/**
 * Person generation options for text-to-video generation
 */
export type PersonGenerationTextToVideo = 'dont_allow' | 'allow_adult';

/**
 * Person generation options for image-to-video generation
 * Only 'dont_allow' is supported for image-to-video
 */
export type PersonGenerationImageToVideo = 'dont_allow';

/**
 * Base configuration for video generation
 */
export interface BaseVideoGenerationConfig {
  /**
   * Aspect ratio of the generated video
   * @default '16:9'
   */
  aspectRatio?: AspectRatio;
  
  /**
   * Number of videos to generate (1 or 2)
   * @default 1
   */
  numberOfVideos?: 1 | 2;
  
  /**
   * Duration of the generated video in seconds (between 5 and 8)
   * @default 5
   */
  durationSeconds?: number;
  
  /**
   * Whether to enhance the prompt
   * @default true
   */
  enhancePrompt?: boolean;
  
  /**
   * Text describing what the model should not generate
   */
  negativePrompt?: string;
}

/**
 * Configuration for text-to-video generation
 */
export interface TextToVideoGenerationConfig extends BaseVideoGenerationConfig {
  /**
   * Whether to allow person generation
   * @default 'dont_allow'
   */
  personGeneration?: PersonGenerationTextToVideo;
}

/**
 * Configuration for image-to-video generation
 */
export interface ImageToVideoGenerationConfig extends BaseVideoGenerationConfig {
  /**
   * Whether to allow person generation
   * Only 'dont_allow' is supported for image-to-video
   * @default 'dont_allow'
   */
  personGeneration?: PersonGenerationImageToVideo;
}

/**
 * Response from the video generation API
 */
export interface VideoGenerationResponse {
  /**
   * Base64-encoded video data
   */
  videoData: string;
  
  /**
   * MIME type of the video
   */
  mimeType: string;
}

/**
 * Error response from the video generation API
 */
export interface VideoGenerationError {
  /**
   * Error code
   */
  code: string;
  
  /**
   * Error message
   */
  message: string;
}
