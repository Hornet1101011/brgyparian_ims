declare module '../utils/sse.js' {
  import { Response } from 'express';
  export function addClient(userId: string, res: Response): void;
  export function removeClient(userId: string, res: Response): void;
  export function sendToUser(userId: string, event: string, data: any): void;
  export function sendToAll(event: string, data: any): void;
  const _default: {
    addClient: typeof addClient;
    removeClient: typeof removeClient;
    sendToUser: typeof sendToUser;
    sendToAll: typeof sendToAll;
  };
  export default _default;
}

declare module '../utils/gridfs.js' {
  import { GridFSBucket } from 'mongodb';
  export function ensureBucket(name: string): any;
  export function getBucket(name: string): any;
}

declare module '../utils/validation.js' {
  export function validateEmail(email: string): boolean;
  export function validatePassword(pw: string): boolean;
}

// Also allow extensionless imports to resolve to the same declarations
declare module '../utils/sse' {
  export * from '../utils/sse.js';
}
declare module '../utils/gridfs' {
  export * from '../utils/gridfs.js';
}
declare module '../utils/validation' {
  export * from '../utils/validation.js';
}
