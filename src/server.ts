import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { videoResourceTemplate, readVideoResource, videoPromptsResource } from './resources/videos.js';
import { imageResourceTemplate, readImageResource, imagePromptsResource } from './resources/images.js';
import { 
  generateVideoFromText, 
  generateVideoFromImage, 
  generateImage,
  generateVideoFromGeneratedImage,
  listGeneratedVideos,
  listGeneratedImages,
  getImage
} from './tools/generateVideo.js';
import { ImageContent } from '@modelcontextprotocol/sdk/types.js';
import { log } from './utils/logger.js';

/**
 * Creates and configures the MCP server for Veo2 video generation
 * 
 * @returns The configured MCP server
 */
export function createServer(): McpServer {
  // Create the MCP server
  const server = new McpServer({
    name: 'veo2-video-generation',
    version: '1.0.0'
  }, {
    capabilities: {
      resources: {
        listChanged: true,
        subscribe: true
      },
      tools: {
        listChanged: true
      }
    }
  });
  
  log.info('Initializing MCP server for Veo2 video generation');
  
  // Register resources
  log.info('Registering video and image resources');
  
  // Register the video resource template
  server.resource(
    'videos',
    videoResourceTemplate,
    {
      description: 'Access generated videos'
    },
    async (uri, variables) => {
      // Since we can't access query parameters directly, we'll just pass an empty URLSearchParams
      return readVideoResource(uri, variables);
    }
  );
  
  // Register the video templates resource
  server.resource(
    'video-templates',
    videoPromptsResource.uri,
    {
      description: videoPromptsResource.description
    },
    async () => videoPromptsResource.read()
  );
  
  // Register the image resource template
  server.resource(
    'images',
    imageResourceTemplate,
    {
      description: 'Access generated images'
    },
    async (uri, variables) => {
      // Since we can't access query parameters directly, we'll just pass an empty URLSearchParams
      return readImageResource(uri, variables);
    }
  );
  
  // Register the image templates resource
  server.resource(
    'image-templates',
    imagePromptsResource.uri,
    {
      description: imagePromptsResource.description
    },
    async () => imagePromptsResource.read()
  );
  
  // Register tools
  log.info('Registering video generation tools');
  
  // Define schemas for tool inputs
  const TextToVideoConfigSchema = z.object({
    aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
    personGeneration: z.enum(['dont_allow', 'allow_adult']).default('dont_allow'),
    numberOfVideos: z.union([z.literal(1), z.literal(2)]).default(1),
    durationSeconds: z.number().min(5).max(8).default(5),
    enhancePrompt: z.boolean().default(false),
    negativePrompt: z.string().default(''),
  });

  // Register the text-to-video generation tool
  server.tool(
    'generateVideoFromText',
    'Generate a video from a text prompt',
    {
      prompt: z.string().min(1).max(1000),
      aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
      personGeneration: z.enum(['dont_allow', 'allow_adult']).default('dont_allow'),
      numberOfVideos: z.union([z.literal(1), z.literal(2)]).default(1),
      durationSeconds: z.number().min(5).max(8).default(5),
      enhancePrompt: z.union([z.boolean(), z.string()]).default(false),
      negativePrompt: z.string().default(''),
      includeFullData: z.union([z.boolean(), z.string()]).default(false),
      autoDownload: z.union([z.boolean(), z.string()]).default(true),
    },
    generateVideoFromText
  );
  
  // Register the image-to-video generation tool
  server.tool(
    'generateVideoFromImage',
    'Generate a video from an image',
    {
      prompt: z.string().min(1).max(1000).optional().default('Generate a video from this image'),
      image: z.union([
        // ImageContent object
        z.object({
          type: z.literal('image'),
          mimeType: z.string(),
          data: z.string().min(1) // base64 encoded image data
        }),
        // URL string
        z.string().url(),
        // File path string
        z.string().min(1)
      ]),
      aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
      personGeneration: z.enum(['dont_allow', 'allow_adult']).default('dont_allow'),
      numberOfVideos: z.union([z.literal(1), z.literal(2)]).default(1),
      durationSeconds: z.number().min(5).max(8).default(5),
      enhancePrompt: z.union([z.boolean(), z.string()]).default(false),
      negativePrompt: z.string().default(''),
      includeFullData: z.union([z.boolean(), z.string()]).default(false),
      autoDownload: z.union([z.boolean(), z.string()]).default(true),
    },
    generateVideoFromImage
  );
  
  // Schema for image generation configuration
  const ImageGenerationConfigSchema = z.object({
    numberOfImages: z.number().min(1).max(4).default(1),
    // Add other Imagen parameters as needed
  });
  
  // Register the image generation tool
  server.tool(
    'generateImage',
    'Generate an image from a text prompt using Google Imagen',
    {
      prompt: z.string().min(1).max(1000),
      numberOfImages: z.number().min(1).max(4).default(1),
      includeFullData: z.union([z.boolean(), z.string()]).default(false),
    },
    generateImage
  );
  
  // Register the image-to-video generation with generated image tool
  server.tool(
    'generateVideoFromGeneratedImage',
    'Generate a video from a generated image (one-step process)',
    {
      prompt: z.string().min(1).max(1000),
      videoPrompt: z.string().min(1).max(1000).optional(),
      // Image generation parameters
      numberOfImages: z.number().min(1).max(4).default(1),
      // Video generation parameters
      aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
      personGeneration: z.enum(['dont_allow', 'allow_adult']).default('dont_allow'),
      numberOfVideos: z.union([z.literal(1), z.literal(2)]).default(1),
      durationSeconds: z.number().min(5).max(8).default(5),
      enhancePrompt: z.union([z.boolean(), z.string()]).default(false),
      negativePrompt: z.string().default(''),
      includeFullData: z.union([z.boolean(), z.string()]).default(false),
      autoDownload: z.union([z.boolean(), z.string()]).default(true),
    },
    generateVideoFromGeneratedImage
  );
  
  // Register the list videos tool
  server.tool(
    'listGeneratedVideos',
    'List all generated videos',
    listGeneratedVideos
  );
  
  // Register the get image tool
  server.tool(
    'getImage',
    'Get a specific image by ID',
    {
      id: z.string().min(1),
      includeFullData: z.union([z.boolean(), z.string()]).default(true),
    },
    getImage
  );
  
  // Register the list images tool
  server.tool(
    'listGeneratedImages',
    'List all generated images',
    listGeneratedImages
  );
  
  log.info('MCP server initialized successfully');
  
  return server;
}
