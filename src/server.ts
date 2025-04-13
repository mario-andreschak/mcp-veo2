import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { videoResourceTemplate, readVideoResource, videoPromptsResource } from './resources/videos.js';
import { 
  generateVideoFromText, 
  generateVideoFromImage, 
  listGeneratedVideos 
} from './tools/generateVideo.js';
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
  log.info('Registering video resources');
  
  // Register the video resource template
  server.resource(
    'videos',
    videoResourceTemplate,
    {
      description: 'Access generated videos'
    },
    readVideoResource
  );
  
  // Register the video templates resource
  server.resource(
    'templates',
    videoPromptsResource.uri,
    {
      description: videoPromptsResource.description
    },
    async () => videoPromptsResource.read()
  );
  
  // Register tools
  log.info('Registering video generation tools');
  
  // Define schemas for tool inputs
  const TextToVideoConfigSchema = z.object({
    aspectRatio: z.enum(['16:9', '9:16']).optional(),
    personGeneration: z.enum(['dont_allow', 'allow_adult']).optional(),
    numberOfVideos: z.union([z.literal(1), z.literal(2)]).optional(),
    durationSeconds: z.number().min(5).max(8).optional(),
    enhancePrompt: z.boolean().optional(),
    negativePrompt: z.string().optional(),
  });

  // Register the text-to-video generation tool
  server.tool(
    'generateVideoFromText',
    'Generate a video from a text prompt',
    {
      prompt: z.string().min(1).max(1000),
      config: TextToVideoConfigSchema.optional(),
    },
    generateVideoFromText
  );
  
  // Register the image-to-video generation tool
  server.tool(
    'generateVideoFromImage',
    'Generate a video from an image',
    {
      prompt: z.string().min(1).max(1000).optional(),
      image: z.string().min(1),
      config: TextToVideoConfigSchema.optional(),
    },
    generateVideoFromImage
  );
  
  // Register the list videos tool
  server.tool(
    'listGeneratedVideos',
    'List all generated videos',
    listGeneratedVideos
  );
  
  log.info('MCP server initialized successfully');
  
  return server;
}
