export type PageSize = "A4" | "Letter" | "Legal";
export type PageOrientation = "portrait" | "landscape";

export interface ExportOptions {
  pageSize: PageSize;
  orientation: PageOrientation;
  includeTheme: boolean;
  fontSize: number;
  includeProperties: boolean;
  includeImages: boolean;
  includeTables: boolean;
  includeCodeBlocks: boolean;
}

export interface ContentFeatures {
  hasFrontmatter: boolean;
  hasImages: boolean;
  hasTables: boolean;
  hasCodeBlocks: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  pageSize: "A4",
  orientation: "portrait",
  includeTheme: true,
  fontSize: 14,
  includeProperties: true,
  includeImages: true,
  includeTables: true,
  includeCodeBlocks: true,
};

export const EMPTY_CONTENT_FEATURES: ContentFeatures = {
  hasFrontmatter: false,
  hasImages: false,
  hasTables: false,
  hasCodeBlocks: false,
};
