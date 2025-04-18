import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { log } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import appConfig from '../config.js';

// Define the storage directory for generated images
const IMAGE_STORAGE_DIR = path.join(appConfig.STORAGE_DIR, 'images');

/**
 * Resource template for accessing generated images
 */
export const imageResourceTemplate = new ResourceTemplate(
  'images://{id}',
  {
    list: async () => {
      try {
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
        
        // Map to MCP resources
        return {
          resources: images.map(image => ({
            uri: `images://${image.id}`,
            name: `Image: ${image.prompt || 'Untitled'}`,
            description: `Generated on ${new Date(image.createdAt).toLocaleString()}`,
            mimeType: image.mimeType,
            filepath: image.filepath
          }))
        };
      } catch (error) {
        log.error('Error listing image resources:', error);
        return { resources: [] };
      }
    }
  }
);

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
 * Resource handler for accessing a specific image
 * 
 * @param uri The resource URI
 * @param variables The URI template variables
 * @returns The image resource contents
 */
export async function readImageResource(
  uri: URL,
  variables: Record<string, string | string[]>
): Promise<ReadResourceResult> {
  // The variables object should contain the 'id' from the URI template
  const { id } = variables;
  
  if (!id || typeof id !== 'string') {
    throw new Error('Missing or invalid image ID in resource URI');
  }
  
  // Default to false since we can't access query parameters
  const includeFullData = false;
  
  try {
    // Get the image metadata
    const metadata = await getImageMetadata(id);
    
    // If includeFullData is true and we have a filepath, return the image data
    if (includeFullData && metadata.filepath) {
      try {
        const imageData = await fs.readFile(metadata.filepath);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: metadata.mimeType || 'image/png',
              blob: imageData.toString('base64'),
              filepath: metadata.filepath
            }
          ]
        };
      } catch (error) {
        log.error(`Error reading image file ${metadata.filepath}:`, error);
        // Fall back to returning just the metadata
      }
    }
    
    // Otherwise, just return the metadata
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            id: metadata.id,
            createdAt: metadata.createdAt,
            prompt: metadata.prompt,
            mimeType: metadata.mimeType,
            size: metadata.size,
            filepath: metadata.filepath
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    log.error(`Error reading image resource ${id}:`, error);
    throw error;
  }
}

/**
 * Resource for accessing example image prompts
 */
export const imagePromptsResource = {
  uri: 'images://templates',
  name: 'Image Generation Templates',
  description: 'Example prompts for generating images with Google Imagen',
  async read(): Promise<ReadResourceResult> {
    // Example prompts for image generation
    const templates = [
      {
        title: 'Nature Landscape',
        prompt: 'A breathtaking mountain landscape with snow-capped peaks, a crystal clear lake in the foreground, and a colorful sunset, photorealistic style',
        config: {
          numberOfImages: 1
        }
      },
      {
        title: 'Futuristic City',
        prompt: 'A futuristic cityscape with flying vehicles, holographic billboards, and towering skyscrapers, digital art style',
        config: {
          numberOfImages: 1
        }
      },
      {
        title: 'Fantasy Character',
        prompt: 'A mystical wizard with flowing robes, glowing staff, and magical energy swirling around them, fantasy art style',
        config: {
          numberOfImages: 1
        }
      },
      {
        title: 'Food Photography',
        prompt: 'A gourmet burger with melted cheese, fresh vegetables, and a brioche bun, on a wooden plate, professional food photography',
        config: {
          numberOfImages: 1
        }
      },
      {
        title: 'Abstract Art',
        prompt: 'Abstract fluid art with vibrant colors flowing and blending together, high resolution',
        config: {
          numberOfImages: 1
        }
      }
    ];
    
    // Format as a text resource
    return {
      contents: [
        {
          uri: 'images://templates',
          mimeType: 'application/json',
          text: JSON.stringify(templates, null, 2)
        }
      ]
    };
  }
};
