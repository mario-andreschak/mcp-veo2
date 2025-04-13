import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { videoResourceTemplate, readVideoResource, videoPromptsResource } from './resources/videos.js';
import { 
  generateVideoFromText, 
  generateVideoFromImage, 
  listGeneratedVideos 
} from './tools/generateVideo.js';
import { 
  TextToVideoInputSchema, 
  ImageToVideoInputSchema 
} from './types/mcp.js';
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
  
  // Register the text-to-video generation tool
  server.tool(
    'generateVideoFromText',
    'Generate a video from a text prompt',
    TextToVideoInputSchema.shape,
    generateVideoFromText
  );
  
  // Register the image-to-video generation tool
  server.tool(
    'generateVideoFromImage',
    'Generate a video from an image',
    ImageToVideoInputSchema.shape,
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
