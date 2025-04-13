import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { veoClient } from '../services/veoClient.js';
import { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

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
          mimeType: video.mimeType
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
 * @returns The video resource contents
 */
export async function readVideoResource(
  uri: URL,
  variables: Record<string, string | string[]>
): Promise<ReadResourceResult> {
  // The variables object should contain the 'id' from the URI template
  const { id } = variables;
  
  if (!id || typeof id !== 'string') {
    throw new Error('Missing or invalid video ID in resource URI');
  }
  
  try {
    // Get the video data and metadata
    const { data, metadata } = await veoClient.getVideo(id);
    
    // Return the video as a blob resource
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: metadata.mimeType,
          blob: data.toString('base64')
        }
      ]
    };
  } catch (error) {
    console.error(`Error reading video resource ${id}:`, error);
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
