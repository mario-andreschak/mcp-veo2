import type { ReadResourceResult } from "@modelcontextprotocol/server";
export const videoPromptsResource = {
  uri: "videos://templates",
  name: "Video Generation Templates",
  description: "Example prompts for generating videos with Veo",
  async read(): Promise<ReadResourceResult> {
    // Example prompts for video generation
    const templates = [
      {
        title: "Nature Scene",
        prompt:
          "Panning wide shot of a serene forest with sunlight filtering through the trees, cinematic quality",
        config: {
          aspectRatio: "16:9",
          personGeneration: "allow_all",
        },
      },
      {
        title: "Urban Timelapse",
        prompt:
          "Timelapse of a busy city intersection at night with cars leaving light trails, cinematic quality",
        config: {
          aspectRatio: "16:9",
          personGeneration: "allow_all",
        },
      },
      {
        title: "Abstract Animation",
        prompt:
          "Abstract fluid animation with vibrant colors morphing and flowing, digital art style",
        config: {
          aspectRatio: "16:9",
          personGeneration: "allow_all",
        },
      },
      {
        title: "Product Showcase",
        prompt:
          "Elegant product showcase of a modern smartphone rotating on a pedestal with soft lighting",
        config: {
          aspectRatio: "16:9",
          personGeneration: "allow_all",
        },
      },
      {
        title: "Food Close-up",
        prompt:
          "Close-up of a delicious chocolate cake with melting chocolate dripping down the sides",
        config: {
          aspectRatio: "16:9",
          personGeneration: "allow_all",
        },
      },
    ];

    // Format as a text resource
    return {
      contents: [
        {
          uri: "videos://templates",
          mimeType: "application/json",
          text: JSON.stringify(templates, null, 2),
        },
      ],
    };
  },
};
