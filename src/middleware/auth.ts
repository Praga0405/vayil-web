import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthRequest, AuthUser, UserType } from '../types';
import { ApiError } from '../utils/http';

export function signToken(payload: AuthUser, staff = false) {
  return jwt.sign(payload, staff ? config.staffJwtSecret : config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

export function requireAuth(allowed?: UserType[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) return next(new ApiError(401, 'Missing bearer token'));
    try {
      let decoded: any;
      try {
        decoded = jwt.verify(token, config.jwtSecret);
      } catch {
        decoded = jwt.verify(token, config.staffJwtSecret);
      }
      req.user = decoded as AuthUser;
      if (allowed?.length && !allowed.includes(req.user.userType)) {
        throw new ApiError(403, 'Access denied for this role');
      }
      next();
    } catch (err) {
      next(err instanceof ApiError ? err : new ApiError(401, 'Invalid or expired token'));
    }
  };
}

export function requireRole(role: string) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.roles?.includes(role)) return next(new ApiError(403, `Missing role: ${role}`));
    next();
  };
}
