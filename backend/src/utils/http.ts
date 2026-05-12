import { Response } from 'express';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const ok = (res: Response, data: any = {}, status = 200) => res.status(status).json({ success: true, ...data });
export const fail = (res: Response, status: number, message: string, details?: unknown) =>
  res.status(status).json({ success: false, message, details });
