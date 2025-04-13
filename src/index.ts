import express from 'express';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from './server.js';
import config from './config.js';
import { log } from './utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Main entry point for the MCP server
 */
async function main() {
  try {
    // Create the MCP server
    const server = createServer();
    
    // Determine the transport type from command line arguments
    const transportType = process.argv[2] || 'stdio';
    
    // Ensure the storage directory exists
    await fs.mkdir(config.STORAGE_DIR, { recursive: true });
    
    if (transportType === 'stdio') {
      // Use stdio transport
      log.info('Starting server with stdio transport');
      
      const transport = new StdioServerTransport();
      await server.connect(transport);
      
      log.info('Server started with stdio transport');
    } else if (transportType === 'sse') {
      // Use SSE transport
      log.info(`Starting server with SSE transport on port ${config.PORT}`);
      
      const app = express();
      const port = config.PORT;
      
      // Store active SSE transports
      const transports: Record<string, SSEServerTransport> = {};
      
      // Serve static files from the generated-videos directory
      app.use('/videos', express.static(config.STORAGE_DIR));
      
      // SSE endpoint
      app.get('/sse', (req, res) => {
        log.info('New SSE connection');
        
        const transport = new SSEServerTransport('/messages', res);
        transports[transport.sessionId] = transport;
        
        res.on('close', () => {
          log.info(`SSE connection closed: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        });
        
        server.connect(transport).catch(err => {
          log.error('Error connecting transport:', err);
        });
      });
      
      // Message endpoint
      app.post('/messages', express.json(), (req, res) => {
        const sessionId = req.query.sessionId as string;
        const transport = transports[sessionId];
        
        if (transport) {
          transport.handlePostMessage(req, res).catch(err => {
            log.error(`Error handling message for session ${sessionId}:`, err);
          });
        } else {
          res.status(404).send('Session not found');
        }
      });
      
      // Start the server
      app.listen(port, () => {
        log.info(`Server started with SSE transport on port ${port}`);
        log.info(`Connect to http://localhost:${port}/sse`);
      });
    } else {
      log.error(`Unknown transport type: ${transportType}`);
      log.info('Usage: npm start [stdio|sse]');
      process.exit(1);
    }
  } catch (error) {
    log.error('Error starting server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
