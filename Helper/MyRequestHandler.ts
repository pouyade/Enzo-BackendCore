import { Request, Response } from 'express';
import { AuthenticatedRequest } from '@/middleware/auth';
  
export type MyRequestHandler = (
  req: AuthenticatedRequest,
  res: Response
) => Promise<Response>;

export const MyRequestHandler = (handler: MyRequestHandler) => {
  return async (req: Request|AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('Unhandled error in request handler:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Internal server error' });
      }
    }
  };
};