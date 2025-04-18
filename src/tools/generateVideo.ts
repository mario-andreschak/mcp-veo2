import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { veoClient } from '../services/veoClient.js';
import { CallToolResult, ImageContent } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../utils/logger.js';
import appConfig from '../config.js';

// Initialize the Google Gen AI client for image generation
const ai = new GoogleGenAI({ apiKey: appConfig.GOOGLE_API_KEY });

// Define schemas for tool inputs
const AspectRatioSchema = z.enum(['16:9', '9:16']);
const PersonGenerationSchema = z.enum(['dont_allow', 'allow_adult']);

// Schema for image generation configuration
const ImageGenerationConfigSchema = z.object({
  numberOfImages: z.number().min(1).max(4).optional(),
  // Add other Imagen parameters as needed
});

// Schema for image generation input
const ImageGenerationInputSchema = z.object({
  prompt: z.string().min(1).max(1000),
  config: ImageGenerationConfigSchema.optional(),
});

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
  image: z.object({
    type: z.literal('image'),
    mimeType: z.string(),
    data: z.string().min(1) // base64 encoded image data
  }),
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
            filepath: metadata.filepath,
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
    // Extract image data from the ImageContent object
    const imageData = args.image.data;
    const mimeType = args.image.mimeType;
    
    // Generate the video
    const metadata = await veoClient.generateFromImage(
      imageData, 
      args.prompt, 
      args.config,
      mimeType
    );
    
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
            filepath: metadata.filepath,
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
 * Tool for generating an image from a text prompt
 * 
 * @param args The tool arguments
 * @returns The tool result with generated image
 */
export async function generateImage(
  args: z.infer<typeof ImageGenerationInputSchema>
): Promise<CallToolResult> {
  try {
    log.info('Generating image from text prompt');
    log.verbose('Image generation parameters:', JSON.stringify(args));
    
    // Generate the image using Imagen
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: args.prompt,
      config: args.config || { numberOfImages: 1 },
    });
    
    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('No images generated in the response');
    }
    
    const generatedImage = response.generatedImages[0];
    
    if (!generatedImage.image?.imageBytes) {
      throw new Error('Generated image missing image bytes');
    }
    
    // Return the result with the image as content
    return {
      content: [
        {
          type: 'image',
          mimeType: 'image/png',
          data: generatedImage.image.imageBytes
        },
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Image generated successfully',
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error('Error generating image:', error);
    
    // Return the error
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error generating image: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

// Schema for image-to-video generation with generated image
const GeneratedImageToVideoInputSchema = z.object({
  prompt: z.string().min(1).max(1000),
  videoPrompt: z.string().min(1).max(1000).optional(),
  imageConfig: ImageGenerationConfigSchema.optional(),
  videoConfig: TextToVideoConfigSchema.optional(),
});

/**
 * Tool for generating a video from a generated image
 * 
 * @param args The tool arguments
 * @returns The tool result
 */
export async function generateVideoFromGeneratedImage(
  args: z.infer<typeof GeneratedImageToVideoInputSchema>
): Promise<CallToolResult> {
  try {
    log.info('Generating video from generated image');
    log.verbose('Image generation parameters:', JSON.stringify(args));
    
    // First generate the image
    const imageResponse = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: args.prompt,
      config: args.imageConfig || { numberOfImages: 1 },
    });
    
    if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
      throw new Error('No images generated in the response');
    }
    
    const generatedImage = imageResponse.generatedImages[0];
    
    if (!generatedImage.image?.imageBytes) {
      throw new Error('Generated image missing image bytes');
    }
    
    // Use the generated image to create a video
    const videoPrompt = args.videoPrompt || args.prompt;
    const metadata = await veoClient.generateFromImage(
      generatedImage.image.imageBytes,
      videoPrompt,
      args.videoConfig,
      'image/png'
    );
    
    // Return the result
    return {
      content: [
        {
          type: 'image',
          mimeType: 'image/png',
          data: generatedImage.image.imageBytes
        },
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'Video generated from image successfully',
            videoId: metadata.id,
            resourceUri: `videos://${metadata.id}`,
            filepath: metadata.filepath,
            metadata
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error('Error generating video from generated image:', error);
    
    // Return the error
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error generating video from generated image: ${error instanceof Error ? error.message : String(error)}`
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
              resourceUri: `videos://${video.id}`,
              filepath: video.filepath
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
