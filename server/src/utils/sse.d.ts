import { Response } from 'express';

export function addClient(userId: string, res: Response): void;
export function removeClient(userId: string, res: Response): void;
export function sendToUser(userId: string, event: string, data: any): void;
export function sendToAll(event: string, data: any): void;

declare const _default: {
  addClient: typeof addClient;
  removeClient: typeof removeClient;
  sendToUser: typeof sendToUser;
  sendToAll: typeof sendToAll;
};

export default _default;
