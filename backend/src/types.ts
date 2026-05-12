import { Request } from 'express';

export type UserType = 'customer' | 'vendor' | 'staff' | 'admin';

export interface AuthUser {
  id: string | number;
  userType: UserType;
  roles?: string[];
  permissions?: string[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
