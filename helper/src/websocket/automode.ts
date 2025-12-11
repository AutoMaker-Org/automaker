import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { autoModeService } from '../bridge/electron-services';

export class AutoModeWebSocketHandler {
  private ws: WebSocket;
  private projectPath?: string;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        logger.info('[AutoMode WS] Received message:', message.type);
        await this.handleMessage(message);
      } catch (error: any) {
        logger.error('AutoMode WebSocket message error:', error);
        this.send({
          type: 'event',
          event: {
            type: 'error',
            error: error.message
          }
        });
      }
    });

    this.ws.on('close', () => {
      logger.info('AutoMode WebSocket closed');
      if (this.projectPath) {
        // Clean up any active auto-mode sessions
      }
    });

    this.ws.on('error', (error) => {
      logger.error('AutoMode WebSocket error:', error);
    });
  }

  async handleMessage(message: any) {
    const { type, ...params } = message;

    switch (type) {
      case 'auto-mode:start':
        await this.handleStart(params);
        break;

      case 'auto-mode:stop':
        await this.handleStop();
        break;

      case 'auto-mode:status':
        await this.handleStatus();
        break;

      case 'auto-mode:run-feature':
        await this.handleRunFeature(params);
        break;

      case 'auto-mode:verify-feature':
        await this.handleVerifyFeature(params);
        break;

      case 'auto-mode:resume-feature':
        await this.handleResumeFeature(params);
        break;

      case 'auto-mode:stop-feature':
        await this.handleStopFeature(params);
        break;

      case 'auto-mode:follow-up-feature':
        await this.handleFollowUpFeature(params);
        break;

      case 'auto-mode:commit-feature':
        await this.handleCommitFeature(params);
        break;

      case 'auto-mode:analyze-project':
        await this.handleAnalyzeProject(params);
        break;

      default:
        this.send({
          type: 'event',
          event: {
            type: 'error',
            error: `Unknown message type: ${type}`
          }
        });
    }
  }

  private async handleStart(params: any) {
    const { projectPath, maxConcurrency } = params;
    this.projectPath = projectPath;

    logger.info('Starting auto-mode:', { projectPath, maxConcurrency });

    try {
      // Create sendToRenderer function that bridges to WebSocket
      const sendToRenderer = (event: any) => {
        this.send({
          type: 'event',
          event
        });
      };

      // Use the existing auto-mode service
      await autoModeService.start({
        projectPath,
        sendToRenderer,
        maxConcurrency
      });

      this.send({
        type: 'event',
        event: {
          type: 'started',
          projectPath,
          success: true
        }
      });
    } catch (error: any) {
      logger.error('Start auto-mode error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'error',
          error: error.message
        }
      });
    }
  }

  private async handleStop() {
    logger.info('Stopping auto-mode');

    try {
      // Use the existing auto-mode service
      await autoModeService.stop();

      this.send({
        type: 'event',
        event: {
          type: 'stopped',
          success: true
        }
      });
    } catch (error: any) {
      logger.error('Stop auto-mode error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'error',
          error: error.message
        }
      });
    }
  }

  private async handleStatus() {
    logger.info('Getting auto-mode status');

    try {
      // Get status from auto-mode service
      const status = autoModeService.getStatus();

      this.send({
        type: 'event',
        event: {
          type: 'status',
          isRunning: status.isRunning,
          features: status.runningFeatures || []
        }
      });
    } catch (error: any) {
      logger.error('Get status error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'status',
          isRunning: false,
          features: []
        }
      });
    }
  }

  private async handleRunFeature(params: any) {
    const { projectPath, featureId } = params;

    logger.info('Running feature:', { projectPath, featureId });

    try {
      // Create sendToRenderer function that bridges to WebSocket
      const sendToRenderer = (event: any) => {
        this.send({
          type: 'event',
          event
        });
      };

      // Use the existing auto-mode service (same as Electron)
      await autoModeService.runFeature({
        projectPath,
        featureId,
        sendToRenderer
      });

    } catch (error: any) {
      logger.error('Feature execution error:', error);

      // Send error event
      this.send({
        type: 'event',
        event: {
          type: 'auto_mode_error',
          featureId,
          error: error.message
        }
      });
    }
  }

  private async handleVerifyFeature(params: any) {
    const { projectPath, featureId } = params;

    logger.info('Verifying feature:', { projectPath, featureId });

    try {
      // Create sendToRenderer function that bridges to WebSocket
      const sendToRenderer = (event: any) => {
        this.send({
          type: 'event',
          event
        });
      };

      // Use the existing auto-mode service
      await autoModeService.verifyFeature({
        projectPath,
        featureId,
        sendToRenderer
      });

    } catch (error: any) {
      logger.error('Verify feature error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'auto_mode_error',
          featureId,
          error: error.message
        }
      });
    }
  }

  private async handleResumeFeature(params: any) {
    const { projectPath, featureId } = params;

    logger.info('Resuming feature:', { projectPath, featureId });

    try {
      // Create sendToRenderer function that bridges to WebSocket
      const sendToRenderer = (event: any) => {
        this.send({
          type: 'event',
          event
        });
      };

      // Use the existing auto-mode service
      await autoModeService.resumeFeature({
        projectPath,
        featureId,
        sendToRenderer
      });

    } catch (error: any) {
      logger.error('Resume feature error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'auto_mode_error',
          featureId,
          error: error.message
        }
      });
    }
  }

  private async handleStopFeature(params: any) {
    const { featureId } = params;

    logger.info('Stopping feature:', featureId);

    try {
      // Use the existing auto-mode service to stop the feature
      await autoModeService.stopFeature({ featureId });

      this.send({
        type: 'event',
        event: {
          type: 'feature:stopped',
          featureId
        }
      });
    } catch (error: any) {
      logger.error('Stop feature error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'auto_mode_error',
          featureId,
          error: error.message
        }
      });
    }
  }

  private async handleFollowUpFeature(params: any) {
    const { projectPath, featureId, prompt, imagePaths } = params;

    logger.info('Following up on feature:', { projectPath, featureId, prompt });

    try {
      // Create sendToRenderer function that bridges to WebSocket
      const sendToRenderer = (event: any) => {
        this.send({
          type: 'event',
          event
        });
      };

      // Use the existing auto-mode service
      await autoModeService.followUpFeature({
        projectPath,
        featureId,
        prompt,
        imagePaths,
        sendToRenderer
      });

    } catch (error: any) {
      logger.error('Follow-up feature error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'auto_mode_error',
          featureId,
          error: error.message
        }
      });
    }
  }

  private async handleCommitFeature(params: any) {
    const { projectPath, featureId } = params;

    logger.info('Committing feature:', { projectPath, featureId });

    try {
      // Create sendToRenderer function that bridges to WebSocket
      const sendToRenderer = (event: any) => {
        this.send({
          type: 'event',
          event
        });
      };

      // Use the existing auto-mode service
      await autoModeService.commitFeature({
        projectPath,
        featureId,
        sendToRenderer
      });

    } catch (error: any) {
      logger.error('Commit feature error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'auto_mode_error',
          featureId,
          error: error.message
        }
      });
    }
  }

  private async handleAnalyzeProject(params: any) {
    const { projectPath } = params;

    logger.info('Analyzing project:', projectPath);

    try {
      // Create sendToRenderer function that bridges to WebSocket
      const sendToRenderer = (event: any) => {
        this.send({
          type: 'event',
          event
        });
      };

      // Use the existing auto-mode service
      await autoModeService.analyzeProject({
        projectPath,
        sendToRenderer
      });

    } catch (error: any) {
      logger.error('Analyze project error:', error);
      this.send({
        type: 'event',
        event: {
          type: 'error',
          error: error.message
        }
      });
    }
  }

  private send(data: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}