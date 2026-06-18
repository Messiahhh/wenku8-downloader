import { z } from 'zod';

export const taskStateSchema = z.enum(['pending', 'running', 'complete', 'failed']);

export const resourceSchema = z.object({
  key: z.string(),
  kind: z.enum(['detail', 'catalogue', 'chapter', 'image', 'cover', 'epub']),
  sourceUrl: z.string().optional(),
  relativePath: z.string().optional(),
  state: taskStateSchema,
  attempts: z.number().int().nonnegative().default(0),
  bytes: z.number().int().nonnegative().optional(),
  sha256: z.string().optional(),
  error: z.string().optional(),
  updatedAt: z.string(),
});

export const manifestSchema = z.object({
  version: z.literal(1),
  bookId: z.number().int().positive(),
  title: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resources: z.record(z.string(), resourceSchema),
});

export type ResourceRecord = z.infer<typeof resourceSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
