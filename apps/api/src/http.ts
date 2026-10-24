import type { Request, Response, NextFunction } from "express";
import type { Role } from "../../../packages/core/src/domain.js";
import { z } from "zod";
export interface User {
  id: string;
  cognito_sub: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  department_id: string | null;
  jurisdiction_id: string | null;
  session_version: number;
  permissions: string[];
}
declare global {
  namespace Express {
    interface Request {
      user: User;
      sessionHash: string;
      csrf: string;
    }
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (status: number, code: string, message: string): never => {
  throw new HttpError(status, code, message);
};
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role))
      return next(
        new HttpError(403, "FORBIDDEN", "This action is not permitted"),
      );
    next();
  };
}
export function permission(req: Request, p: string) {
  if (req.user.role !== "ADMIN" && !req.user.permissions.includes(p))
    fail(403, "FORBIDDEN", "Required permission is missing");
}
export const page = (req: Request) =>
  z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .parse(req.query);
