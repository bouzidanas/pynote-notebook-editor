import { File, FileCode2, FileDigit, FileImage, FileMusic, FilePlay, FileSpreadsheet, FileText } from "lucide-solid";

export const WORKSPACE_ROOT = "/workspace";

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDate = (value: number): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

export const toBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

export const parentPath = (path: string): string => {
  if (path === WORKSPACE_ROOT) return WORKSPACE_ROOT;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return WORKSPACE_ROOT;
  return `/${parts.slice(0, -1).join("/")}`;
};

export const basename = (path: string): string => {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

export const splitBreadcrumbs = (path: string): Array<{ label: string; path: string }> => {
  const clean = path.split("/").filter(Boolean);
  const out: Array<{ label: string; path: string }> = [];
  out.push({ label: "workspace", path: WORKSPACE_ROOT });
  for (let i = 1; i < clean.length; i += 1) {
    out.push({ label: clean[i], path: `/${clean.slice(0, i + 1).join("/")}` });
  }
  return out;
};

export const getFileExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1).toLowerCase();
};

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff", "ico", "heic", "heif"]);
const tabularDataExtensions = new Set(["csv", "tsv", "xls", "xlsx", "ods", "parquet", "feather", "arrow"]);
const structuredDataExtensions = new Set(["json", "jsonl", "ndjson", "yaml", "yml", "toml", "xml", "sql", "db", "sqlite", "sqlite3"]);
const documentExtensions = new Set(["txt", "md", "rst", "tex", "pdf", "doc", "docx", "rtf"]);
const codeExtensions = new Set(["ipynb", "py", "r", "jl", "js", "jsx", "ts", "tsx", "java", "cpp", "c", "cs", "go", "rs", "sh", "bash"]);
const audioExtensions = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a"]);
const videoExtensions = new Set(["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv"]);

export const getFileIcon = (name: string) => {
  const ext = getFileExtension(name);
  if (imageExtensions.has(ext)) return FileImage;
  if (tabularDataExtensions.has(ext)) return FileSpreadsheet;
  if (structuredDataExtensions.has(ext)) return FileDigit;
  if (audioExtensions.has(ext)) return FileMusic;
  if (videoExtensions.has(ext)) return FilePlay;
  if (codeExtensions.has(ext)) return FileCode2;
  if (documentExtensions.has(ext)) return FileText;
  return File;
};
