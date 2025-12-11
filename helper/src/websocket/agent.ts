import { WebSocket } from 'ws';
import path from 'path';
import { logger } from '../utils/logger';

export class AgentWebSocketHandler {
  private ws: WebSocket;
  private sessionId?: string;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(message);
      } catch (error: any) {
        logger.error('Agent WebSocket message error:', error);
        this.send({
          type: 'error',
          error: error.message
        });
      }
    });

    this.ws.on('close', () => {
      logger.info('Agent WebSocket closed');
      if (this.sessionId) {
        // Clean up any active agent sessions
      }
    });

    this.ws.on('error', (error) => {
      logger.error('Agent WebSocket error:', error);
    });
  }

  private async handleMessage(message: any) {
    const { type, sessionId, ...params } = message;

    switch (type) {
      case 'agent:start':
        await this.handleStart(sessionId, params.workingDirectory);
        break;

      case 'agent:send':
        await this.handleSend(sessionId, params);
        break;

      case 'agent:stop':
        await this.handleStop(sessionId);
        break;

      case 'agent:clear':
        await this.handleClear(sessionId);
        break;

      case 'agent:getHistory':
        await this.handleGetHistory(sessionId);
        break;

      default:
        this.send({
          type: 'error',
          error: `Unknown message type: ${type}`
        });
    }
  }

  private async handleStart(sessionId: string, workingDirectory: string) {
    this.sessionId = sessionId;
    
    // TODO: Initialize agent service
    logger.info('Starting agent session:', { sessionId, workingDirectory });
    
    this.send({
      type: 'started',
      sessionId,
      success: true
    });
  }

  private async handleSend(sessionId: string, params: any) {
    const { message, workingDirectory, imagePaths } = params;
    
    // TODO: Send message to agent service
    logger.info('Sending to agent:', { sessionId, message });
    
    // Simulate streaming response
    const chunks = [
      "I understand you want help with your project. ",
      "Let me analyze the request... ",
      "I'll help you with that."
    ];

    for (const chunk of chunks) {
      await new Promise(resolve => setTimeout(resolve, 100));
      this.send({
        type: 'stream',
        sessionId,
        chunk
      });
    }

    this.send({
      type: 'stream',
      sessionId,
      done: true
    });
  }

  private async handleStop(sessionId: string) {
    // TODO: Stop agent execution
    logger.info('Stopping agent:', sessionId);
    
    this.send({
      type: 'stopped',
      sessionId,
      success: true
    });
  }

  private async handleClear(sessionId: string) {
    // TODO: Clear agent history
    logger.info('Clearing agent history:', sessionId);
    
    this.send({
      type: 'cleared',
      sessionId,
      success: true
    });
  }

  private async handleGetHistory(sessionId: string) {
    // TODO: Get agent history
    logger.info('Getting agent history:', sessionId);
    
    this.send({
      type: 'history',
      sessionId,
      history: []
    });
  }

  private send(data: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}