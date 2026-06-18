export type TextBlock = {
  type: 'paragraph' | 'heading' | 'note';
  text: string;
  level?: number;
};

export type ImageBlock = {
  type: 'image';
  sourceUrl: string | null;
  assetId?: string;
  alt: string;
};

export type SeparatorBlock = { type: 'separator' };

export type ContentBlock = TextBlock | ImageBlock | SeparatorBlock;

export interface Chapter {
  id: string;
  index: number;
  title: string;
  sourceUrl: string;
  blocks: ContentBlock[];
}

export interface Volume {
  id: string;
  index: number;
  title: string;
  chapters: Chapter[];
}

export interface Asset {
  id: string;
  sourceUrl: string;
  relativePath: string;
  mediaType: string;
  sha256: string;
  bytes: number;
  width?: number;
  height?: number;
  role: 'cover' | 'illustration';
}

export interface Book {
  id: number;
  title: string;
  author: string;
  language: string;
  description: string;
  sourceUrl: string;
  catalogueUrl: string;
  coverSourceUrl?: string;
  coverAssetId?: string;
  metadata: Record<string, string>;
  volumes: Volume[];
  assets: Asset[];
}

export interface BookSummary {
  id: number;
  title: string;
  author?: string;
  category?: string;
  updatedAt?: string;
  length?: string;
  status?: string;
  tags?: string[];
  description?: string;
  notice?: string;
}
