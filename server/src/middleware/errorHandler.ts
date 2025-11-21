import { Request, Response, NextFunction } from 'express';

// Centralized error handler for Express
export default function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (!err) return next();
  try {
    // Log full error server-side for debugging
    console.error('Unhandled error:', err && (err.stack || err));
  } catch (e) {
    // ignore logging failures
  }

  // Handle Mongo duplicate-key errors consistently
  const isDuplicateKey = err && (err.code === 11000 || err.code === 'E11000' || err.codeName === 'DuplicateKey' || err.name === 'MongoServerError');
  if (isDuplicateKey) {
    const keyValue = err.keyValue || {};
    return res.status(409).json({ message: 'Duplicate key error', keyValue });
  }

  // If error already has an HTTP status, use it
  const status = (err && err.status) || 500;
  const message = (err && err.message) || 'Internal Server Error';
  return res.status(status).json({ message });
}
