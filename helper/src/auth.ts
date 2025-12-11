import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AUTH_TOKEN_SECRET } from './config';
import { logger } from './utils/logger';

export class AuthManager {
  private token: string;

  constructor() {
    // Generate a unique token for this session
    this.token = this.generateToken();
  }

  private generateToken(): string {
    const payload = {
      id: uuidv4(),
      type: 'helper',
      timestamp: Date.now()
    };
    
    return jwt.sign(payload, AUTH_TOKEN_SECRET, {
      expiresIn: '24h'
    });
  }

  getToken(): string {
    return this.token;
  }

  verifyToken(token: string): boolean {
    try {
      jwt.verify(token, AUTH_TOKEN_SECRET);
      return true;
    } catch (err) {
      return false;
    }
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn(`Unauthorized request to ${req.path}`);
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.slice(7);
      
      if (!this.verifyToken(token)) {
        logger.warn(`Invalid token for request to ${req.path}`);
        return res.status(401).json({ error: 'Invalid token' });
      }

      next();
    };
  }
}