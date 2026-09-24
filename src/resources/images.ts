import type { ReadResourceResult } from "@modelcontextprotocol/server";
export const imagePromptsResource = {
  uri: "images://templates",
  name: "Image Generation Templates",
  description: "Example prompts for generating images with Gemini",
  async read(): Promise<ReadResourceResult> {
    // Example prompts for image generation
    const templates = [
      {
        title: "Nature Landscape",
        prompt:
          "A breathtaking mountain landscape with snow-capped peaks, a crystal clear lake in the foreground, and a colorful sunset, photorealistic style",
        config: {
          numberOfImages: 1,
        },
      },
      {
        title: "Futuristic City",
        prompt:
          "A futuristic cityscape with flying vehicles, holographic billboards, and towering skyscrapers, digital art style",
        config: {
          numberOfImages: 1,
        },
      },
      {
        title: "Fantasy Character",
        prompt:
          "A mystical wizard with flowing robes, glowing staff, and magical energy swirling around them, fantasy art style",
        config: {
          numberOfImages: 1,
        },
      },
      {
        title: "Food Photography",
        prompt:
          "A gourmet burger with melted cheese, fresh vegetables, and a brioche bun, on a wooden plate, professional food photography",
        config: {
          numberOfImages: 1,
        },
      },
      {
        title: "Abstract Art",
        prompt:
          "Abstract fluid art with vibrant colors flowing and blending together, high resolution",
        config: {
          numberOfImages: 1,
        },
      },
    ];

    // Format as a text resource
    return {
      contents: [
        {
          uri: "images://templates",
          mimeType: "application/json",
          text: JSON.stringify(templates, null, 2),
        },
      ],
    };
  },
};
