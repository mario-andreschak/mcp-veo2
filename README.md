# MCP Video Generation with Veo2

This project implements a Model Context Protocol (MCP) server that exposes Google's Veo2 video generation capabilities. It allows clients to generate videos from text prompts or images, and access the generated videos through MCP resources.

## Features

- Generate videos from text prompts
- Generate videos from images
- Access generated videos through MCP resources
- Example video generation templates
- Support for both stdio and SSE transports

## Prerequisites

- Node.js 18 or higher
- Google API key with access to Gemini API and Veo2 model

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mcp-video-generation-veo2.git
   cd mcp-video-generation-veo2
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your Google API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your Google API key
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Starting the Server

You can start the server with either stdio or SSE transport:

#### stdio Transport (Default)

```bash
npm start
# or
npm start stdio
```

#### SSE Transport

```bash
npm start sse
```

This will start the server on port 3000 (or the port specified in your `.env` file).

### MCP Tools

The server exposes the following MCP tools:

#### generateVideoFromText

Generates a video from a text prompt.

Parameters:
- `prompt` (string): The text prompt for video generation
- `config` (object, optional): Configuration options
  - `aspectRatio` (string, optional): "16:9" or "9:16"
  - `personGeneration` (string, optional): "dont_allow" or "allow_adult"
  - `numberOfVideos` (number, optional): 1 or 2
  - `durationSeconds` (number, optional): Between 5 and 8
  - `enhancePrompt` (boolean, optional): Whether to enhance the prompt
  - `negativePrompt` (string, optional): Text describing what not to generate

Example:
```json
{
  "prompt": "Panning wide shot of a serene forest with sunlight filtering through the trees, cinematic quality",
  "config": {
    "aspectRatio": "16:9",
    "personGeneration": "dont_allow",
    "durationSeconds": 8
  }
}
```

#### generateVideoFromImage

Generates a video from an image.

Parameters:
- `image` (string): Base64-encoded image data
- `prompt` (string, optional): Text prompt to guide the video generation
- `config` (object, optional): Configuration options (same as above, but personGeneration only supports "dont_allow")

#### listGeneratedVideos

Lists all generated videos.

### MCP Resources

The server exposes the following MCP resources:

#### videos://{id}

Access a generated video by its ID.

#### videos://templates

Access example video generation templates.

## Development

### Project Structure

- `src/`: Source code
  - `index.ts`: Main entry point
  - `server.ts`: MCP server configuration
  - `config.ts`: Configuration handling
  - `types/`: Type definitions
  - `tools/`: MCP tool implementations
  - `resources/`: MCP resource implementations
  - `services/`: External service integrations
  - `utils/`: Utility functions

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## License

MIT
