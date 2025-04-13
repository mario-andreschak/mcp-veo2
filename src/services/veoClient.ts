import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';
import { 
  TextToVideoGenerationConfig, 
  ImageToVideoGenerationConfig,
  VideoGenerationResponse,
  VideoGenerationError
} from '../types/veo.js';
import { StoredVideoMetadata } from '../types/mcp.js';

/**
 * Client for interacting with Google's Veo2 video generation API
 */
export class VeoClient {
  private model: GenerativeModel;
  private storageDir: string;
  
  /**
   * Creates a new VeoClient instance
   */
  constructor() {
    // Initialize the Google Generative AI client
    const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY);
    
    // Get the Veo2 model
    this.model = genAI.getGenerativeModel({ model: 'veo-2.0-generate-001' });
    
    // Set the storage directory
    this.storageDir = config.STORAGE_DIR;
    
    // Ensure the storage directory exists
    this.ensureStorageDir().catch(err => {
      console.error('Failed to create storage directory:', err);
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
    config?: TextToVideoGenerationConfig
  ): Promise<StoredVideoMetadata> {
    try {
      // Prepare the request parameters
      const params = {
        prompt,
        ...config
      };
      
      // Generate the video
      // Note: Using any type here as the Gemini API for video generation
      // might not be fully typed in the current SDK version
      const result = await (this.model as any).generateVideos(params);
      
      // Save the video to disk
      return this.saveVideo(result, prompt, config);
    } catch (error) {
      console.error('Error generating video from text:', error);
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
    config?: ImageToVideoGenerationConfig
  ): Promise<StoredVideoMetadata> {
    try {
      // Prepare the request parameters
      const params = {
        image,
        prompt,
        ...config
      };
      
      // Generate the video
      // Note: Using any type here as the Gemini API for video generation
      // might not be fully typed in the current SDK version
      const result = await (this.model as any).generateVideos(params);
      
      // Save the video to disk
      return this.saveVideo(result, prompt, config);
    } catch (error) {
      console.error('Error generating video from image:', error);
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
    result: any,
    prompt?: string,
    config?: TextToVideoGenerationConfig | ImageToVideoGenerationConfig
  ): Promise<StoredVideoMetadata> {
    // Generate a unique ID for the video
    const id = uuidv4();
    
    // Get the video data from the response
    // The exact structure depends on the Gemini API response format
    // Assuming the response contains a video property or the first video in an array
    const videoData = result.video || 
                     (result.videos && result.videos[0]) || 
                     (result.response && result.response.video) ||
                     (result.response && result.response.videos && result.response.videos[0]);
    
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
        personGeneration: (config as TextToVideoGenerationConfig)?.personGeneration || 'dont_allow',
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
      console.error(`Error getting video ${id}:`, error);
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
      console.error(`Error getting metadata for video ${id}:`, error);
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
      console.error('Error listing videos:', error);
      return [];
    }
  }
}

// Export a singleton instance
export const veoClient = new VeoClient();
