export type PageSize = "A4" | "Letter" | "Legal";
export type PageOrientation = "portrait" | "landscape";

export interface ExportOptions {
  pageSize: PageSize;
  orientation: PageOrientation;
  includeTheme: boolean;
  fontSize: number;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  pageSize: "A4",
  orientation: "portrait",
  includeTheme: true,
  fontSize: 14,
};
