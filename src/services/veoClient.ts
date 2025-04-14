import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';
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
    this.client = new GoogleGenAI({ apiKey: config.GOOGLE_API_KEY });
    
    // Set the storage directory
    this.storageDir = config.STORAGE_DIR;
    
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
   * Wrapper method to generate a video
   * 
   * @param params The video generation parameters
   * @returns The video data
   */
  private async generateVideo(
    params: {
      prompt: string;
      image?: string;
      aspectRatio?: string;
      personGeneration?: string;
      numberOfVideos?: number;
      durationSeconds?: number;
      enhancePrompt?: boolean;
      negativePrompt?: string;
    }
  ): Promise<string> {
    try {
      // Create contents array for the request
      const contents: Array<string | { inlineData: { data: string; mimeType: string } }> = [];
      
      // Add text prompt
      contents.push(params.prompt || 'Generate a video');
      
      // Add image if provided
      if (params.image) {
        contents.push({
          inlineData: {
            data: params.image,
            mimeType: 'image/jpeg'
          }
        });
      }
      
      // Create generation config
      const generateConfig: Record<string, any> = {};
      
      // Add optional parameters if provided
      if (params.aspectRatio) {
        generateConfig.aspectRatio = params.aspectRatio;
      }
      
      if (params.personGeneration) {
        generateConfig.personGeneration = params.personGeneration;
      }
      
      if (params.numberOfVideos) {
        generateConfig.numberOfVideos = params.numberOfVideos;
      }
      
      if (params.durationSeconds) {
        generateConfig.durationSeconds = params.durationSeconds;
      }
      
      if (params.enhancePrompt !== undefined) {
        generateConfig.enhancePrompt = params.enhancePrompt;
      }
      
      if (params.negativePrompt) {
        generateConfig.negativePrompt = params.negativePrompt;
      }
      
      // Call the generateContent method
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: generateConfig
      });
      
      // Extract the video data from the response
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No candidates returned from the model');
      }
      
      const candidate = response.candidates[0];
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('No content parts returned from the model');
      }
      
      const part = candidate.content.parts[0];
      if (!part.text) {
        throw new Error('No text content returned from the model');
      }
      
      return part.text;
    } catch (error) {
      log.error('Error generating video:', error);
      throw error;
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
      // Prepare the request parameters
      const params = {
        prompt,
        ...config
      };
      
      // Generate the video using the Gemini API
      const videoData = await this.generateVideo(params);
      
      // Create a result object
      const result = {
        response: {
          videos: [videoData]
        }
      };
      
      // Save the video to disk
      return this.saveVideo(result, prompt, config);
    } catch (error) {
      log.error('Error generating video from text:', error);
      throw error;
    }
  }
  
  /**
   * Generates a video from an image
   * 
   * @param image Base64-encoded image data
   * @param prompt Optional text prompt for video generation
   * @param config Optional configuration for video generation
   * @returns Metadata for the generated video
   */
  async generateFromImage(
    image: string,
    prompt?: string,
    config?: VideoConfig
  ): Promise<StoredVideoMetadata> {
    try {
      // Prepare the request parameters
      // Ensure prompt is a string
      const params = {
        image,
        prompt: prompt || 'Generate a video from this image',
        ...config
      };
      
      // Generate the video using the Gemini API
      const videoData = await this.generateVideo(params);
      
      // Create a result object
      const result = {
        response: {
          videos: [videoData]
        }
      };
      
      // Save the video to disk
      return this.saveVideo(result, prompt, config);
    } catch (error) {
      log.error('Error generating video from image:', error);
      throw error;
    }
  }
  
  /**
   * Saves a generated video to disk
   * 
   * @param result The video generation result
   * @param prompt The prompt used for generation
   * @param config The configuration used for generation
   * @returns Metadata for the saved video
   */
  private async saveVideo(
    result: { response: { videos: string[] } },
    prompt?: string,
    config?: VideoConfig
  ): Promise<StoredVideoMetadata> {
    // Generate a unique ID for the video
    const id = uuidv4();
    
    // Get the video data from the response using the properly typed structure
    const videoData = result.response.videos[0];
    
    if (!videoData) {
      throw new Error('No video data found in the response');
    }
    
    // Determine the file extension based on MIME type
    const mimeType = 'video/mp4'; // Assuming Veo2 returns MP4 videos
    const extension = '.mp4';
    
    // Create the file path
    const filePath = path.join(this.storageDir, `${id}${extension}`);
    
    // Save the video to disk
    await fs.writeFile(filePath, Buffer.from(videoData, 'base64'));
    
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
      size: Buffer.from(videoData, 'base64').length
    };
    
    // Save the metadata
    await this.saveMetadata(id, metadata);
    
    return metadata;
  }
  
  /**
   * Saves video metadata to disk
   * 
   * @param id The video ID
   * @param metadata The video metadata
   */
  private async saveMetadata(id: string, metadata: StoredVideoMetadata): Promise<void> {
    const metadataPath = path.join(this.storageDir, `${id}.json`);
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
      
      // Get the video data
      const extension = metadata.mimeType === 'video/mp4' ? '.mp4' : '.webm';
      const filePath = path.join(this.storageDir, `${id}${extension}`);
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
      const metadataPath = path.join(this.storageDir, `${id}.json`);
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
        const filePath = path.join(this.storageDir, file);
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
