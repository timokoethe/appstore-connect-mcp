import { z } from 'zod';

// Opaque IDs, restricted to one segment accepted by the GET-only Apple client.
export const resourceId = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/);

export class ToolError extends Error {
  constructor(public readonly code: 'invalid_input' | 'invalid_cursor' | 'output_too_large' | 'record_too_large', message: string) {
    super(message);
    this.name = 'ToolError';
  }
}
