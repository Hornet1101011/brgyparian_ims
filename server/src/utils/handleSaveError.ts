import { Response } from 'express';

export function handleSaveError(err: any, res?: Response): boolean {
  if (!err) return false;
  const isDuplicate = err && (err.code === 11000 || err.code === 'E11000' || err.codeName === 'DuplicateKey' || err.name === 'MongoServerError');
  if (isDuplicate) {
    const keyValue = err.keyValue || {};
    if (res) {
      res.status(409).json({ message: 'Duplicate key error', keyValue });
    }
    return true;
  }
  return false;
}

export default handleSaveError;
