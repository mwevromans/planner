import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { PlannerError } from '../types.js';

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new PlannerError(400, 'Ongeldig id');
  return n;
}

/** Express 4 vangt fouten uit async handlers niet op; dit geeft ze door aan de foutafhandeling. */
export function wrap(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next: NextFunction) => { fn(req, res).catch(next); };
}
