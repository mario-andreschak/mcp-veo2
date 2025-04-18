import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { veoClient } from '../services/veoClient.js';
import { CallToolResult, ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../utils/logger.js';
import appConfig from '../config.js';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Initialize the Google Gen AI client for image generation
const ai = new GoogleGenAI({ apiKey: appConfig.GOOGLE_API_KEY });

// Define the storage directory for generated images
const IMAGE_STORAGE_DIR = path.join(appConfig.STORAGE_DIR, 'images');

// Ensure the image storage directory exists
(async () => {
  try {
    await fs.mkdir(IMAGE_STORAGE_DIR, { recursive: true });
  } catch (error) {
    log.fatal('Failed to create image storage directory:', error);
    process.exit(1);
  }
})();

/**
 * Saves a generated image to disk
 * 
 * @param imageBytes The base64 encoded image data
 * @param prompt The prompt used to generate the image
 * @param mimeType The MIME type of the image
 * @returns The filepath and ID of the saved image
 */
async function saveGeneratedImage(
  imageBytes: string,
  prompt: string,
  mimeType: string = 'image/png'
): Promise<{ id: string; filepath: string }> {
  try {
    // Generate a unique ID for the image
    const id = uuidv4();
    
    // Determine the file extension based on MIME type
    let extension = '.png';
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      extension = '.jpg';
    } else if (mimeType === 'image/webp') {
      extension = '.webp';
    }
    
    // Create the file path
    const filepath = path.resolve(IMAGE_STORAGE_DIR, `${id}${extension}`);
    
    // Convert base64 to buffer and save to disk
    const buffer = Buffer.from(imageBytes, 'base64');
    await fs.writeFile(filepath, buffer);
    
    // Save metadata
    const metadata = {
      id,
      createdAt: new Date().toISOString(),
      prompt,
      mimeType,
      size: buffer.length,
      filepath
    };
    
    const metadataPath = path.resolve(IMAGE_STORAGE_DIR, `${id}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    
    log.info(`Image saved successfully with ID: ${id}`);
    return { id, filepath };
  } catch (error) {
    log.error('Error saving generated image:', error);
    throw error;
  }
}

// Define schemas for tool inputs
const AspectRatioSchema = z.enum(['16:9', '9:16']);
const PersonGenerationSchema = z.enum(['dont_allow', 'allow_adult']);

/**
 * Tool for generating a video from a text prompt
 * 
 * @param args The tool arguments
 * @returns The tool result
 */
export async function generateVideoFromText(args: {
  prompt: string;
  aspectRatio?: '16:9' | '9:16';
  personGeneration?: 'dont_allow' | 'allow_adult';
  numberOfVideos?: 1 | 2;
  durationSeconds?: number;
  enhancePrompt?: boolean | string;
  negativePrompt?: string;
  includeFullData?: boolean | string;
  autoDownload?: boolean | string;
}): Promise<CallToolResult> {
  try {
    log.info('Generating video from text prompt');
    log.verbose('Text prompt parameters:', JSON.stringify(args));
    
    // Convert string boolean parameters to actual booleans
    const enhancePrompt = typeof args.enhancePrompt === 'string'
      ? args.enhancePrompt.toLowerCase() === 'true' || args.enhancePrompt === '1'
      : args.enhancePrompt ?? false;
      
    const includeFullData = typeof args.includeFullData === 'string'
      ? args.includeFullData.toLowerCase() === 'true' || args.includeFullData === '1'
      : args.includeFullData ?? false;
      
    const autoDownload = typeof args.autoDownload === 'string'
      ? args.autoDownload.toLowerCase() === 'true' || args.autoDownload === '1'
      : args.autoDownload ?? true;
    
    // Create config object from individual parameters with defaults
    const config = {
      aspectRatio: args.aspectRatio || '16:9',
      personGeneration: args.personGeneration || 'dont_allow',
      numberOfVideos: args.numberOfVideos || 1,
      durationSeconds: args.durationSeconds || 5,
      enhancePrompt: enhancePrompt,
      negativePrompt: args.negativePrompt || ''
    };

    // Options for video generation with defaults
    const options = {
      includeFullData: includeFullData,
      autoDownload: autoDownload
    };
    
    // Generate the video
    const result = await veoClient.generateFromText(args.prompt, config, options);
    
    // Prepare response content
    const responseContent: Array<TextContent | ImageContent> = [];
    
    // If includeFullData is true and we have video data, include it in the response
    if (args.includeFullData && result.videoData) {
      responseContent.push({
        type: 'image', // Use 'image' type for video content since MCP doesn't have a 'video' type
        mimeType: result.mimeType,
        data: result.videoData
      });
    }
    
    // Add text content with metadata
    responseContent.push({
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: 'Video generated successfully',
        videoId: result.id,
        resourceUri: `videos://${result.id}`,
        filepath: result.filepath,
        videoUrl: result.videoUrl,
        metadata: result
      }, null, 2)
    });
    
    // Return the result
    return {
      content: responseContent
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
export async function generateVideoFromImage(args: {
  image: string | { type: 'image'; mimeType: string; data: string };
  prompt?: string;
  aspectRatio?: '16:9' | '9:16';
  personGeneration?: 'dont_allow' | 'allow_adult';
  numberOfVideos?: 1 | 2;
  durationSeconds?: number;
  enhancePrompt?: boolean | string;
  negativePrompt?: string;
  includeFullData?: boolean | string;
  autoDownload?: boolean | string;
}): Promise<CallToolResult> {
  try {
    log.info('Generating video from image');
    log.verbose('Image parameters:', JSON.stringify(args));
    
    // Extract image data based on the type
    let imageData: string;
    let mimeType: string | undefined;
    
    if (typeof args.image === 'string') {
      // It's a URL or file path
      imageData = args.image;
    } else {
      // It's an ImageContent object
      imageData = args.image.data;
      mimeType = args.image.mimeType;
    }
    
    // Convert string boolean parameters to actual booleans
    const enhancePrompt = typeof args.enhancePrompt === 'string'
      ? args.enhancePrompt.toLowerCase() === 'true' || args.enhancePrompt === '1'
      : args.enhancePrompt ?? false;
      
    const includeFullData = typeof args.includeFullData === 'string'
      ? args.includeFullData.toLowerCase() === 'true' || args.includeFullData === '1'
      : args.includeFullData ?? false;
      
    const autoDownload = typeof args.autoDownload === 'string'
      ? args.autoDownload.toLowerCase() === 'true' || args.autoDownload === '1'
      : args.autoDownload ?? true;
    
    // Create config object from individual parameters with defaults
    const config = {
      aspectRatio: args.aspectRatio || '16:9',
      personGeneration: args.personGeneration || 'dont_allow',
      numberOfVideos: args.numberOfVideos || 1,
      durationSeconds: args.durationSeconds || 5,
      enhancePrompt: enhancePrompt,
      negativePrompt: args.negativePrompt || ''
    };

    // Options for video generation with defaults
    const options = {
      includeFullData: includeFullData,
      autoDownload: autoDownload
    };
    
    // Generate the video
    const result = await veoClient.generateFromImage(
      imageData, 
      args.prompt, 
      config,
      options,
      mimeType
    );
    
    // Prepare response content
    const responseContent: Array<TextContent | ImageContent> = [];
    
    // If includeFullData is true and we have video data, include it in the response
    if (args.includeFullData && result.videoData) {
      responseContent.push({
        type: 'image', // Use 'image' type for video content since MCP doesn't have a 'video' type
        mimeType: result.mimeType,
        data: result.videoData
      });
    }
    
    // Add text content with metadata
    responseContent.push({
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: 'Video generated successfully',
        videoId: result.id,
        resourceUri: `videos://${result.id}`,
        filepath: result.filepath,
        videoUrl: result.videoUrl,
        metadata: result
      }, null, 2)
    });
    
    // Return the result
    return {
      content: responseContent
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
export async function generateImage(args: {
  prompt: string;
  numberOfImages?: number;
  includeFullData?: boolean | string;
}): Promise<CallToolResult> {
  try {
    log.info('Generating image from text prompt');
    log.verbose('Image generation parameters:', JSON.stringify(args));
    
    // Create config object
    const config = {
      numberOfImages: args.numberOfImages || 1
    };
    
    // Generate the image using Imagen
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: args.prompt,
      config: config,
    });
    
    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error('No images generated in the response');
    }
    
    const generatedImage = response.generatedImages[0];
    
    if (!generatedImage.image?.imageBytes) {
      throw new Error('Generated image missing image bytes');
    }
    
    // Save the generated image to disk
    const { id, filepath } = await saveGeneratedImage(
      generatedImage.image.imageBytes,
      args.prompt,
      'image/png'
    );
    
    // Prepare response content
    const responseContent: Array<TextContent | ImageContent> = [];
    
    // Convert includeFullData to boolean if it's a string
    const includeFullData = typeof args.includeFullData === 'string'
      ? args.includeFullData.toLowerCase() === 'true' || args.includeFullData === '1'
      : args.includeFullData !== false;
    
    // If includeFullData is true (default) or not specified, include the image data
    if (includeFullData) {
      responseContent.push({
        type: 'image',
        mimeType: 'image/png',
        data: generatedImage.image.imageBytes
      });
    }
    
    // Add text content with metadata
    responseContent.push({
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: 'Image generated successfully',
        imageId: id,
        resourceUri: `images://${id}`,
        filepath: filepath
      }, null, 2)
    });
    
    // Return the result
    return {
      content: responseContent
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

/**
 * Tool for generating a video from a generated image
 * 
 * @param args The tool arguments
 * @returns The tool result
 */
export async function generateVideoFromGeneratedImage(args: {
  prompt: string;
  videoPrompt?: string;
  // Image generation parameters
  numberOfImages?: number;
  // Video generation parameters
  aspectRatio?: '16:9' | '9:16';
  personGeneration?: 'dont_allow' | 'allow_adult';
  numberOfVideos?: 1 | 2;
  durationSeconds?: number;
  enhancePrompt?: boolean | string;
  negativePrompt?: string;
  includeFullData?: boolean | string;
  autoDownload?: boolean | string;
}): Promise<CallToolResult> {
  try {
    log.info('Generating video from generated image');
    log.verbose('Image generation parameters:', JSON.stringify(args));
    
    // Convert string boolean parameters to actual booleans
    const enhancePrompt = typeof args.enhancePrompt === 'string'
      ? args.enhancePrompt.toLowerCase() === 'true' || args.enhancePrompt === '1'
      : args.enhancePrompt ?? false;
      
    const includeFullData = typeof args.includeFullData === 'string'
      ? args.includeFullData.toLowerCase() === 'true' || args.includeFullData === '1'
      : args.includeFullData ?? false;
      
    const autoDownload = typeof args.autoDownload === 'string'
      ? args.autoDownload.toLowerCase() === 'true' || args.autoDownload === '1'
      : args.autoDownload ?? true;
    
    // Create image config with defaults
    const imageConfig = {
      numberOfImages: args.numberOfImages || 1
    };
    
    // Create video config with defaults
    const videoConfig = {
      aspectRatio: args.aspectRatio || '16:9',
      personGeneration: args.personGeneration || 'dont_allow',
      numberOfVideos: args.numberOfVideos || 1,
      durationSeconds: args.durationSeconds || 5,
      enhancePrompt: enhancePrompt,
      negativePrompt: args.negativePrompt || ''
    };
    
    // Options for video generation with defaults
    const options = {
      includeFullData: includeFullData,
      autoDownload: autoDownload
    };
    
    // First generate the image
    const imageResponse = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: args.prompt,
      config: imageConfig,
    });
    
    if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
      throw new Error('No images generated in the response');
    }
    
    const generatedImage = imageResponse.generatedImages[0];
    
    if (!generatedImage.image?.imageBytes) {
      throw new Error('Generated image missing image bytes');
    }
    
    // Save the generated image to disk
    const { id: imageId, filepath: imageFilepath } = await saveGeneratedImage(
      generatedImage.image.imageBytes,
      args.prompt,
      'image/png'
    );
    
    // Use the generated image to create a video
    const videoPrompt = args.videoPrompt || args.prompt;
    const result = await veoClient.generateFromImage(
      generatedImage.image.imageBytes,
      videoPrompt,
      videoConfig,
      options,
      'image/png'
    );
    
    // Prepare response content
    const responseContent: Array<TextContent | ImageContent> = [];
    
    // Always include the generated image
    responseContent.push({
      type: 'image',
      mimeType: 'image/png',
      data: generatedImage.image.imageBytes
    });
    
    // If includeFullData is true and we have video data, include it in the response
    if (args.includeFullData && result.videoData) {
      responseContent.push({
        type: 'image', // Use 'image' type for video content since MCP doesn't have a 'video' type
        mimeType: result.mimeType,
        data: result.videoData
      });
    }
    
    // Add text content with metadata
    responseContent.push({
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: 'Video generated from image successfully',
        videoId: result.id,
        videoResourceUri: `videos://${result.id}`,
        videoFilepath: result.filepath,
        videoUrl: result.videoUrl,
        imageId: imageId,
        imageResourceUri: `images://${imageId}`,
        imageFilepath: imageFilepath,
        metadata: result
      }, null, 2)
    });
    
    // Return the result
    return {
      content: responseContent
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
 * Gets image metadata by ID
 * 
 * @param id The image ID
 * @returns The image metadata
 */
async function getImageMetadata(id: string): Promise<any> {
  try {
    const metadataPath = path.resolve(IMAGE_STORAGE_DIR, `${id}.json`);
    const metadataJson = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(metadataJson);
  } catch (error) {
    log.error(`Error getting metadata for image ${id}:`, error);
    throw new Error(`Image metadata not found: ${id}`);
  }
}

/**
 * Tool for getting an image by ID
 * 
 * @param args The tool arguments
 * @returns The tool result
 */
export async function getImage(args: {
  id: string;
  includeFullData?: boolean | string;
}): Promise<CallToolResult> {
  try {
    log.info(`Getting image with ID: ${args.id}`);
    
    // Get the image metadata
    const metadata = await getImageMetadata(args.id);
    
    // Convert includeFullData to boolean if it's a string
    const includeFullData = typeof args.includeFullData === 'string'
      ? args.includeFullData.toLowerCase() === 'true' || args.includeFullData === '1'
      : args.includeFullData !== false;
    
    // Prepare response content
    const responseContent: Array<TextContent | ImageContent> = [];
    
    // If includeFullData is true (default) or not specified, include the image data
    if (includeFullData && metadata.filepath) {
      try {
        const imageData = await fs.readFile(metadata.filepath);
        responseContent.push({
          type: 'image',
          mimeType: metadata.mimeType || 'image/png',
          data: imageData.toString('base64')
        });
      } catch (error) {
        log.error(`Error reading image file ${metadata.filepath}:`, error);
        // Continue without the image data
      }
    }
    
    // Add text content with metadata
    responseContent.push({
      type: 'text',
      text: JSON.stringify({
        success: true,
        message: 'Image retrieved successfully',
        imageId: metadata.id,
        resourceUri: `images://${metadata.id}`,
        filepath: metadata.filepath,
        prompt: metadata.prompt,
        createdAt: metadata.createdAt,
        mimeType: metadata.mimeType,
        size: metadata.size
      }, null, 2)
    });
    
    // Return the result
    return {
      content: responseContent
    };
  } catch (error) {
    log.error(`Error getting image:`, error);
    
    // Return the error
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error getting image: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

/**
 * Tool for listing all generated images
 * 
 * @returns The tool result
 */
export async function listGeneratedImages(): Promise<CallToolResult> {
  try {
    log.info('Listing all generated images');
    
    // Get all files in the image storage directory
    const files = await fs.readdir(IMAGE_STORAGE_DIR);
    
    // Filter for JSON metadata files
    const metadataFiles = files.filter(file => file.endsWith('.json'));
    
    // Read and parse each metadata file
    const imagesPromises = metadataFiles.map(async file => {
      const filePath = path.resolve(IMAGE_STORAGE_DIR, file);
      try {
        const metadataJson = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(metadataJson);
      } catch (error) {
        log.error(`Error reading image metadata file ${filePath}:`, error);
        return null;
      }
    });
    
    // Wait for all metadata to be read and filter out any null values
    const images = (await Promise.all(imagesPromises)).filter(image => image !== null);
    
    // Return the result
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            count: images.length,
            images: images.map(image => ({
              id: image.id,
              createdAt: image.createdAt,
              prompt: image.prompt,
              resourceUri: `images://${image.id}`,
              filepath: image.filepath,
              mimeType: image.mimeType,
              size: image.size
            }))
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error('Error listing images:', error);
    
    // Return the error
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error listing images: ${error instanceof Error ? error.message : String(error)}`
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
              filepath: video.filepath,
              videoUrl: video.videoUrl
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
