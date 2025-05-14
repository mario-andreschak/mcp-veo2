[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/mario-andreschak-mcp-veo2-badge.png)](https://mseep.ai/app/mario-andreschak-mcp-veo2)

# MCP Video Generation with Veo2

[![smithery badge](https://smithery.ai/badge/@mario-andreschak/mcp-video-generation-veo2)](https://smithery.ai/server/@mario-andreschak/mcp-video-generation-veo2)

This project implements a Model Context Protocol (MCP) server that exposes Google's Veo2 video generation capabilities. It allows clients to generate videos from text prompts or images, and access the generated videos through MCP resources.

<a href="https://glama.ai/mcp/servers/@mario-andreschak/mcp-veo2">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@mario-andreschak/mcp-veo2/badge" alt="Video Generation with Veo2 MCP server" />
</a>

## Features

- Generate **videos from text** prompts
- Generate **videos from images**
- Access generated videos through MCP resources
- Example video generation templates
- Support for both stdio and SSE transports

## Example Images
![1dec9c71-07dc-4a6e-9e17-8da355d72ba1](https://github.com/user-attachments/assets/ba987d14-dd46-49ac-9b31-1ce398e86c6f)


## Example Image to Video
[Image to Video - from Grok generated puppy](https://github.com/mario-andreschak/mcp-veo2/raw/refs/heads/main/example-files/2a6a0807-d323-4424-a48a-e40a82b883bb.mp4)

[Image to Video - from real cat](https://github.com/mario-andreschak/mcp-veo2/raw/refs/heads/main/example-files/55b9f28b-61a6-423e-bb86-f3791c639177.mp4)


## Prerequisites

- Node.js 18 or higher
- Google API key with access to Gemini API and Veo2 model (= You need to set up a credit card with your API key! -> Go to aistudio.google.com )

## Installation

### Installing in [FLUJO](https://github.com/mario-andreschak/FLUJO/)
1. Click Add Server
2. Copy & Paste Github URL into FLUJO
3. Click Parse, Clone, Install, Build and Save.

### Installing via Smithery

To install mcp-video-generation-veo2 for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@mario-andreschak/mcp-veo2):

```bash
npx -y @smithery/cli install @mario-andreschak/mcp-veo2 --client claude
```

### Manual Installation
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

   The `.env` file supports the following variables:
   - `GOOGLE_API_KEY`: Your Google API key (required)
   - `PORT`: Server port (default: 3000)
   - `STORAGE_DIR`: Directory for storing generated videos (default: ./generated-videos)
   - `LOG_LEVEL`: Logging level (default: fatal)
     - Available levels: verbose, debug, info, warn, error, fatal, none
     - For development, set to `debug` or `info` for more detailed logs
     - For production, keep as `fatal` to minimize console output

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