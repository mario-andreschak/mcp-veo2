import { GoogleGenAI, GenerateVideosParameters } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import appConfig from '../config.js';
import { log } from '../utils/logger.js';

// Define types for video generation
interface VideoConfig {
  aspectRatio?: '16:9' | '9:16';
  personGeneration?: 'dont_allow' | 'allow_adult';
  numberOfVideos?: 1 | 2;
  durationSeconds?: number;
  enhancePrompt?: boolean;
  negativePrompt?: string;
}

// Define types for video generation operation
interface VideoOperation {
  done: boolean;
  response?: {
    generatedVideos?: Array<{
      video?: {
        uri?: string;
      };
    }>;
  };
}

// Metadata for stored videos
interface StoredVideoMetadata {
  id: string;
  createdAt: string;
  prompt?: string;
  config: {
    aspectRatio: '16:9' | '9:16';
    personGeneration: 'dont_allow' | 'allow_adult';
    durationSeconds: number;
  };
  mimeType: string;
  size: number;
  filepath: string; // Path to the video file on disk
}

/**
 * Client for interacting with Google's Veo2 video generation API
 */
export class VeoClient {
  private client: GoogleGenAI;
  private model: string = 'veo-2.0-generate-001';
  private storageDir: string;
  
  /**
   * Creates a new VeoClient instance
   */
  constructor() {
    // Initialize the Google Gen AI client
    this.client = new GoogleGenAI({ apiKey: appConfig.GOOGLE_API_KEY });
    
    // Set the storage directory
    this.storageDir = appConfig.STORAGE_DIR;
    
    // Ensure the storage directory exists
    this.ensureStorageDir().catch(err => {
      log.fatal('Failed to create storage directory:', err);
      process.exit(1);
    });
  }
  
  /**
   * Ensures the storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create storage directory: ${error}`);
    }
  }
  
  /**
   * Generates a video from a text prompt
   * 
   * @param prompt The text prompt for video generation
   * @param config Optional configuration for video generation
   * @returns Metadata for the generated video
   */
  async generateFromText(
    prompt: string, 
    config?: VideoConfig
  ): Promise<StoredVideoMetadata> {
    try {
      log.info('Generating video from text prompt');
      log.verbose('Text prompt parameters:', JSON.stringify({ prompt, config }));
      
      // Create generation config
      const generateConfig: Record<string, any> = {};
      
      // Add optional parameters if provided
      if (config?.aspectRatio) {
        generateConfig.aspectRatio = config.aspectRatio;
      }
      
      if (config?.personGeneration) {
        generateConfig.personGeneration = config.personGeneration;
      }
      
      if (config?.numberOfVideos) {
        generateConfig.numberOfVideos = config.numberOfVideos;
      }
      
      if (config?.durationSeconds) {
        generateConfig.durationSeconds = config.durationSeconds;
      }
      
      if (config?.enhancePrompt !== undefined) {
        generateConfig.enhancePrompt = config.enhancePrompt;
      }
      
      if (config?.negativePrompt) {
        generateConfig.negativePrompt = config.negativePrompt;
      }
      
      // Initialize request parameters
      const requestParams = {
        model: this.model,
        prompt: prompt,
        config: generateConfig
      };
      
      // Call the generateVideos method
      log.debug('Calling generateVideos API');
      let operation = await this.client.models.generateVideos(requestParams);
      
      // Poll until the operation is complete
      log.debug('Polling operation status');
      while (!operation.done) {
        log.verbose('Operation not complete, waiting...', JSON.stringify(operation));
        // Wait for 5 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await this.client.operations.getVideosOperation({
          operation: operation
        });
      }
      
      log.debug('Video generation operation complete');
      log.verbose('Operation result:', JSON.stringify(operation));
      
      // Check if we have generated videos
      if (!operation.response?.generatedVideos || operation.response.generatedVideos.length === 0) {
        throw new Error('No videos generated in the response');
      }
      
      // Download each video
      const videoPromises = operation.response.generatedVideos.map(async (generatedVideo, index) => {
        if (!generatedVideo.video?.uri) {
          log.warn('Generated video missing URI');
          return null;
        }
        
        // Append API key to the URI - use the imported config module
        const videoUri = `${generatedVideo.video.uri}&key=${appConfig.GOOGLE_API_KEY}`;
        log.debug(`Fetching video ${index + 1} from URI`);
        
        // Fetch the video
        const response = await fetch(videoUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
        }
        
        // Convert the response to a buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Generate a unique ID for the video
        const id = index === 0 ? uuidv4() : `${uuidv4()}_${index}`;
        
        // Save the video to disk
        return this.saveVideoBuffer(buffer, prompt, config, id);
      });
      
      // Wait for all videos to be downloaded and saved
      const metadataArray = await Promise.all(videoPromises);
      
      // Filter out any null values (from videos with missing URIs)
      const validMetadata = metadataArray.filter(metadata => metadata !== null);
      
      if (validMetadata.length === 0) {
        throw new Error('Failed to save any videos');
      }
      
      // Return the first video's metadata
      return validMetadata[0] as StoredVideoMetadata;
    } catch (error) {
      log.error('Error generating video from text:', error);
      throw error;
    }
  }
  
  /**
   * Generates a video from an image
   * 
   * @param imageBytes Base64-encoded image data
   * @param prompt Optional text prompt for video generation
   * @param config Optional configuration for video generation
   * @returns Metadata for the generated video
   */
  async generateFromImage(
    imageBytes: string,
    prompt?: string,
    config?: VideoConfig,
    mimeType: string = 'image/png'
  ): Promise<StoredVideoMetadata> {
    try {
      log.info('Generating video from image');
      log.verbose('Image prompt parameters:', JSON.stringify({ prompt, config, mimeType }));
      
      // Create generation config
      const generateConfig: Record<string, any> = {};
      
      // Add optional parameters if provided
      if (config?.aspectRatio) {
        generateConfig.aspectRatio = config.aspectRatio;
      }
      
      if (config?.personGeneration) {
        generateConfig.personGeneration = config.personGeneration;
      }
      
      if (config?.numberOfVideos) {
        generateConfig.numberOfVideos = config.numberOfVideos;
      }
      
      if (config?.durationSeconds) {
        generateConfig.durationSeconds = config.durationSeconds;
      }
      
      if (config?.enhancePrompt !== undefined) {
        generateConfig.enhancePrompt = config.enhancePrompt;
      }
      
      if (config?.negativePrompt) {
        generateConfig.negativePrompt = config.negativePrompt;
      }
      
      // Initialize request parameters with the image
      const requestParams = {
        model: this.model,
        prompt: prompt || 'Generate a video from this image',
        image: {
          imageBytes: imageBytes,
          mimeType: mimeType
        },
        config: generateConfig
      };
      
      // Call the generateVideos method
      log.debug('Calling generateVideos API with image');
      let operation = await this.client.models.generateVideos(requestParams);
      
      // Poll until the operation is complete
      log.debug('Polling operation status');
      while (!operation.done) {
        log.verbose('Operation not complete, waiting...', JSON.stringify(operation));
        // Wait for 5 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await this.client.operations.getVideosOperation({
          operation: operation
        });
      }
      
      log.debug('Video generation operation complete');
      log.verbose('Operation result:', JSON.stringify(operation));
      
      // Check if we have generated videos
      if (!operation.response?.generatedVideos || operation.response.generatedVideos.length === 0) {
        throw new Error('No videos generated in the response');
      }
      
      // Download each video
      const videoPromises = operation.response.generatedVideos.map(async (generatedVideo, index) => {
        if (!generatedVideo.video?.uri) {
          log.warn('Generated video missing URI');
          return null;
        }
        
        // Append API key to the URI - use the imported config module
        const videoUri = `${generatedVideo.video.uri}&key=${appConfig.GOOGLE_API_KEY}`;
        log.debug(`Fetching video ${index + 1} from URI`);
        
        // Fetch the video
        const response = await fetch(videoUri);
        if (!response.ok) {
          throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
        }
        
        // Convert the response to a buffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Generate a unique ID for the video
        const id = index === 0 ? uuidv4() : `${uuidv4()}_${index}`;
        
        // Save the video to disk
        return this.saveVideoBuffer(buffer, prompt, config, id);
      });
      
      // Wait for all videos to be downloaded and saved
      const metadataArray = await Promise.all(videoPromises);
      
      // Filter out any null values (from videos with missing URIs)
      const validMetadata = metadataArray.filter(metadata => metadata !== null);
      
      if (validMetadata.length === 0) {
        throw new Error('Failed to save any videos');
      }
      
      // Return the first video's metadata
      return validMetadata[0] as StoredVideoMetadata;
    } catch (error) {
      log.error('Error generating video from image:', error);
      throw error;
    }
  }
  
  /**
   * Saves a video buffer to disk
   * 
   * @param videoBuffer The video buffer to save
   * @param prompt The prompt used for generation
   * @param config The configuration used for generation
   * @param id The ID to use for the video
   * @returns Metadata for the saved video
   */
  private async saveVideoBuffer(
    videoBuffer: Buffer,
    prompt?: string,
    config?: VideoConfig,
    id: string = uuidv4()
  ): Promise<StoredVideoMetadata> {
    try {
      log.debug(`Saving video with ID: ${id}`);
      
      // Determine the file extension based on MIME type
      const mimeType = 'video/mp4'; // Assuming Veo2 returns MP4 videos
      const extension = '.mp4';
      
      // Create the file path (using absolute path)
      const filePath = path.resolve(this.storageDir, `${id}${extension}`);
      
      // Save the video to disk
      await fs.writeFile(filePath, videoBuffer);
      
      // Create and return the metadata
      const metadata: StoredVideoMetadata = {
        id,
        createdAt: new Date().toISOString(),
        prompt,
        config: {
          aspectRatio: config?.aspectRatio || '16:9',
          personGeneration: config?.personGeneration || 'dont_allow',
          durationSeconds: config?.durationSeconds || 5
        },
        mimeType,
        size: videoBuffer.length,
        filepath: filePath
      };
      
      // Save the metadata
      await this.saveMetadata(id, metadata);
      
      log.info(`Video saved successfully with ID: ${id}`);
      return metadata;
    } catch (error) {
      log.error(`Error saving video buffer: ${error}`);
      throw error;
    }
  }
  
  /**
   * Saves video metadata to disk
   * 
   * @param id The video ID
   * @param metadata The video metadata
   */
  private async saveMetadata(id: string, metadata: StoredVideoMetadata): Promise<void> {
    const metadataPath = path.resolve(this.storageDir, `${id}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  /**
   * Gets a video by ID
   * 
   * @param id The video ID
   * @returns The video data and metadata
   */
  async getVideo(id: string): Promise<{ data: Buffer; metadata: StoredVideoMetadata }> {
    try {
      // Get the metadata
      const metadata = await this.getMetadata(id);
      
      // Get the video data - use the filepath from metadata if available
      let filePath: string;
      if (metadata.filepath) {
        filePath = metadata.filepath;
      } else {
        // Fallback to constructing the path
        const extension = metadata.mimeType === 'video/mp4' ? '.mp4' : '.webm';
        filePath = path.resolve(this.storageDir, `${id}${extension}`);
        
        // Update the metadata with the filepath
        metadata.filepath = filePath;
        await this.saveMetadata(id, metadata);
      }
      
      const data = await fs.readFile(filePath);
      
      return { data, metadata };
    } catch (error) {
      log.error(`Error getting video ${id}:`, error);
      throw new Error(`Video not found: ${id}`);
    }
  }
  
  /**
   * Gets video metadata by ID
   * 
   * @param id The video ID
   * @returns The video metadata
   */
  async getMetadata(id: string): Promise<StoredVideoMetadata> {
    try {
      const metadataPath = path.resolve(this.storageDir, `${id}.json`);
      const metadataJson = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(metadataJson) as StoredVideoMetadata;
    } catch (error) {
      log.error(`Error getting metadata for video ${id}:`, error);
      throw new Error(`Video metadata not found: ${id}`);
    }
  }
  
  /**
   * Lists all generated videos
   * 
   * @returns Array of video metadata
   */
  async listVideos(): Promise<StoredVideoMetadata[]> {
    try {
      // Get all files in the storage directory
      const files = await fs.readdir(this.storageDir);
      
      // Filter for JSON metadata files
      const metadataFiles = files.filter(file => file.endsWith('.json'));
      
      // Read and parse each metadata file
      const metadataPromises = metadataFiles.map(async file => {
        const filePath = path.resolve(this.storageDir, file);
        const metadataJson = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(metadataJson) as StoredVideoMetadata;
      });
      
      // Wait for all metadata to be read
      return Promise.all(metadataPromises);
    } catch (error) {
      log.error('Error listing videos:', error);
      return [];
    }
  }
}

// Export a singleton instance
export const veoClient = new VeoClient();
