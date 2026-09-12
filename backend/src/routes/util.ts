import type { Request } from 'express';
import { PlannerError } from '../types.js';

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new PlannerError(400, 'Ongeldig id');
  return n;
}
