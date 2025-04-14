import { z } from 'zod';
import { veoClient } from '../services/veoClient.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../utils/logger.js';

// Define schemas for tool inputs
const AspectRatioSchema = z.enum(['16:9', '9:16']);
const PersonGenerationSchema = z.enum(['dont_allow', 'allow_adult']);

// Schema for text-to-video generation configuration
const TextToVideoConfigSchema = z.object({
  aspectRatio: AspectRatioSchema.optional(),
  personGeneration: PersonGenerationSchema.optional(),
  numberOfVideos: z.union([z.literal(1), z.literal(2)]).optional(),
  durationSeconds: z.number().min(5).max(8).optional(),
  enhancePrompt: z.boolean().optional(),
  negativePrompt: z.string().optional(),
});

// Schema for text-to-video generation input
const TextToVideoInputSchema = z.object({
  prompt: z.string().min(1).max(1000),
  config: TextToVideoConfigSchema.optional(),
});

// Schema for image-to-video generation input
const ImageToVideoInputSchema = z.object({
  prompt: z.string().min(1).max(1000).optional(),
  image: z.string().min(1),
  config: TextToVideoConfigSchema.optional(),
});

/**
 * Tool for generating a video from a text prompt
 * 
 * @param args The tool arguments
 * @returns The tool result
 */
export async function generateVideoFromText(
  args: z.infer<typeof TextToVideoInputSchema>
): Promise<CallToolResult> {
  try {
    // Generate the video
    const metadata = await veoClient.generateFromText(args.prompt, args.config);
    
    // Return the result
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Video generated successfully',
            videoId: metadata.id,
            resourceUri: `videos://${metadata.id}`,
            metadata
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error('Error generating video from text:', error);
    
    // Return the error
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error generating video: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

/**
 * Tool for generating a video from an image
 * 
 * @param args The tool arguments
 * @returns The tool result
 */
export async function generateVideoFromImage(
  args: z.infer<typeof ImageToVideoInputSchema>
): Promise<CallToolResult> {
  try {
    // Generate the video
    const metadata = await veoClient.generateFromImage(args.image, args.prompt, args.config);
    
    // Return the result
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Video generated successfully',
            videoId: metadata.id,
            resourceUri: `videos://${metadata.id}`,
            metadata
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error('Error generating video from image:', error);
    
    // Return the error
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error generating video: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

/**
 * Tool for listing all generated videos
 * 
 * @returns The tool result
 */
export async function listGeneratedVideos(): Promise<CallToolResult> {
  try {
    // Get all videos
    const videos = await veoClient.listVideos();
    
    // Return the result
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            count: videos.length,
            videos: videos.map(video => ({
              id: video.id,
              createdAt: video.createdAt,
              prompt: video.prompt,
              resourceUri: `videos://${video.id}`
            }))
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error('Error listing videos:', error);
    
    // Return the error
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error listing videos: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
