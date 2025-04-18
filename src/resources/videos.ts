import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { veoClient } from '../services/veoClient.js';
import { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../utils/logger.js';

/**
 * Resource template for accessing generated videos
 */
export const videoResourceTemplate = new ResourceTemplate(
  'videos://{id}',
  {
    list: async () => {
      // Get all videos
      const videos = await veoClient.listVideos();
      
      // Map to MCP resources
      return {
        resources: videos.map(video => ({
          uri: `videos://${video.id}`,
          name: `Video: ${video.prompt || 'Untitled'}`,
          description: `Generated on ${new Date(video.createdAt).toLocaleString()}`,
          mimeType: video.mimeType,
          filepath: video.filepath
        }))
      };
    }
  }
);

/**
 * Resource handler for accessing a specific video
 * 
 * @param uri The resource URI
 * @param variables The URI template variables
 * @param query Optional query parameters
 * @returns The video resource contents
 */
export async function readVideoResource(
  uri: URL,
  variables: Record<string, string | string[]>,
  query?: URLSearchParams
): Promise<ReadResourceResult> {
  // The variables object should contain the 'id' from the URI template
  const { id } = variables;
  
  if (!id || typeof id !== 'string') {
    throw new Error('Missing or invalid video ID in resource URI');
  }
  
  // Default to false if query is not provided
  const includeFullData = false;
  
  try {
    // Get the video data and metadata with the includeFullData option
    const result = await veoClient.getVideo(id, { includeFullData });
    
    // If includeFullData is true and we have video data, return it
    if (includeFullData && result.videoData) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: result.metadata.mimeType,
            blob: result.videoData,
            filepath: result.metadata.filepath
          }
        ]
      };
    }
    
    // Otherwise, just return the metadata
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            id: result.metadata.id,
            createdAt: result.metadata.createdAt,
            prompt: result.metadata.prompt,
            config: result.metadata.config,
            mimeType: result.metadata.mimeType,
            size: result.metadata.size,
            filepath: result.metadata.filepath,
            videoUrl: result.metadata.videoUrl
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error(`Error reading video resource ${id}:`, error);
    throw error;
  }
}

/**
 * Resource for accessing example video prompts
 */
export const videoPromptsResource = {
  uri: 'videos://templates',
  name: 'Video Generation Templates',
  description: 'Example prompts for generating videos with Veo2',
  async read(): Promise<ReadResourceResult> {
    // Example prompts for video generation
    const templates = [
      {
        title: 'Nature Scene',
        prompt: 'Panning wide shot of a serene forest with sunlight filtering through the trees, cinematic quality',
        config: {
          aspectRatio: '16:9',
          personGeneration: 'dont_allow'
        }
      },
      {
        title: 'Urban Timelapse',
        prompt: 'Timelapse of a busy city intersection at night with cars leaving light trails, cinematic quality',
        config: {
          aspectRatio: '16:9',
          personGeneration: 'dont_allow'
        }
      },
      {
        title: 'Abstract Animation',
        prompt: 'Abstract fluid animation with vibrant colors morphing and flowing, digital art style',
        config: {
          aspectRatio: '16:9',
          personGeneration: 'dont_allow'
        }
      },
      {
        title: 'Product Showcase',
        prompt: 'Elegant product showcase of a modern smartphone rotating on a pedestal with soft lighting',
        config: {
          aspectRatio: '16:9',
          personGeneration: 'dont_allow'
        }
      },
      {
        title: 'Food Close-up',
        prompt: 'Close-up of a delicious chocolate cake with melting chocolate dripping down the sides',
        config: {
          aspectRatio: '16:9',
          personGeneration: 'dont_allow'
        }
      }
    ];
    
    // Format as a text resource
    return {
      contents: [
        {
          uri: 'videos://templates',
          mimeType: 'application/json',
          text: JSON.stringify(templates, null, 2)
        }
      ]
    };
  }
};
