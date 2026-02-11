import { type Component, createSignal, createEffect, onMount, onCleanup, For, Show } from "solid-js";
import { createDropzone, createFileUploader } from "@solid-primitives/upload";
import type { UploadFile } from "@solid-primitives/upload";
import { kernel } from "../../lib/pyodide";
import { useFormContext } from "./FormContext";
import { resolveColor, resolveBorder, resolveBackground } from "./colorUtils";
import { UploadCloud, CheckCircle, XCircle, FileUp, X, Loader } from "lucide-solid";

// --- Types ---

type FileStatus = "pending" | "uploading" | "success" | "error";

interface TrackedFile {
  /** Unique key for this entry (filename or filename + counter) */
  key: string;
  name: string;
  size: number;
  type: string;
  /** base64-encoded file data */
  data_base64: string;
  status: FileStatus;
  error?: string;
}

interface UploadProps {
  id: string;
  props: {
    accept?: string | null;
    max_size?: number | null;
    label?: string | null;
    color?: string | null;
    size?: "xs" | "sm" | "md" | "lg" | "xl" | null;
    disabled?: boolean;
    width?: string | number | null;
    height?: string | number | null;
    grow?: number | null;
    shrink?: number | null;
    force_dimensions?: boolean;
    border?: boolean | string | null;
    background?: boolean | string | null;
    hidden?: boolean;
  };
}

// --- Helpers ---

/** Read a File object as a base64 string (strips the data URL prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip "data:<mime>;base64," prefix
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Generate a unique key, appending a counter if the name already exists. */
function uniqueKey(name: string, existing: TrackedFile[]): string {
  const names = new Set(existing.map(f => f.key));
  if (!names.has(name)) return name;
  let i = 2;
  while (names.has(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}

/** Format bytes to a human-readable string */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Component ---

const Upload: Component<UploadProps> = (p) => {
  const componentId = p.id;
  const formContext = useFormContext();
  const [allProps, setAllProps] = createSignal(p.props);
  const [files, setFiles] = createSignal<TrackedFile[]>([]);
  const [isDragOver, setIsDragOver] = createSignal(false);

  // Guard flag: when true, incoming component_update is a status ack — do NOT echo back
  let isProcessingAck = false;

  // Reactive accessors
  const disabled = () => allProps().disabled ?? false;
  const size = () => allProps().size ?? "md";
  const hidden = () => allProps().hidden ?? false;
  const label = () => allProps().label ?? "Upload";
  const accept = () => allProps().accept ?? undefined;

  const sizeConfig = () => {
    switch (size()) {
      case "xs": return { padding: 6, textSize: "text-[length:var(--text-3xs)]", iconSize: 20, fileTextSize: "text-[10px]" };
      case "sm": return { padding: 8, textSize: "text-[length:var(--text-2xs)]", iconSize: 24, fileTextSize: "text-xs" };
      case "md": return { padding: 12, textSize: "text-sm", iconSize: 32, fileTextSize: "text-xs" };
      case "lg": return { padding: 14, textSize: "text-xl", iconSize: 40, fileTextSize: "text-sm" };
      case "xl": return { padding: 16, textSize: "text-3xl", iconSize: 48, fileTextSize: "text-base" };
      default: return { padding: 12, textSize: "text-sm", iconSize: 32, fileTextSize: "text-xs" };
    }
  };

  // Keep allProps in sync with parent
  createEffect(() => {
    setAllProps(p.props);
  });

  // --- Dropzone setup ---
  const { setRef: dropzoneRef, files: droppedFiles } = createDropzone({
    onDrop: async (dropped) => {
      if (disabled()) return;
      await processNewFiles(dropped);
    },
    onDragOver: () => setIsDragOver(true),
    onDragStart: () => setIsDragOver(true),
  });

  // Also use createFileUploader for the click-to-browse fallback
  const { selectFiles } = createFileUploader({ multiple: true, accept: accept() ?? "*" });

  // Track drag leave to clear the drag-over visual state
  let dropzoneEl: HTMLDivElement | undefined;
  const handleDragLeave = (e: DragEvent) => {
    // Only reset if leaving the dropzone itself (not entering a child)
    if (dropzoneEl && !dropzoneEl.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };
  const handleDrop = () => setIsDragOver(false);

  // --- File processing ---
  async function processNewFiles(uploaded: UploadFile[]) {
    const currentFiles = files();
    const newTracked: TrackedFile[] = [];

    for (const uf of uploaded) {
      try {
        const data_base64 = await readFileAsBase64(uf.file);
        const key = uniqueKey(uf.name, [...currentFiles, ...newTracked]);
        newTracked.push({
          key,
          name: uf.name,
          size: uf.size,
          type: uf.file.type,
          data_base64,
          status: "pending",
        });
      } catch {
        const key = uniqueKey(uf.name, [...currentFiles, ...newTracked]);
        newTracked.push({
          key,
          name: uf.name,
          size: uf.size,
          type: uf.file.type,
          data_base64: "",
          status: "error",
          error: "Failed to read file",
        });
      }
    }

    const combined = [...currentFiles, ...newTracked];
    setFiles(combined);

    // If inside a form, defer upload — just store the data for form submission
    if (formContext) {
      formContext.setChildValue(componentId, buildFormValue(combined));
    } else {
      // Not in a form: upload immediately
      await uploadFiles(newTracked);
    }
  }

  /** Build the value to store in form context (array of file payloads). */
  function buildFormValue(tracked: TrackedFile[]) {
    return tracked
      .filter(f => f.status !== "error" || f.data_base64) // exclude read-error files without data
      .map(f => ({
        key: f.key,
        name: f.name,
        size: f.size,
        type: f.type,
        data_base64: f.data_base64,
      }));
  }

  /** Send files to Python via kernel interaction. */
  async function uploadFiles(toUpload: TrackedFile[]) {
    // Mark as uploading
    setFiles(prev =>
      prev.map(f =>
        toUpload.some(u => u.key === f.key)
          ? { ...f, status: "uploading" as FileStatus }
          : f
      )
    );

    const payload = toUpload
      .filter(f => f.data_base64) // skip files with read errors
      .map(f => ({
        key: f.key,
        name: f.name,
        size: f.size,
        type: f.type,
        data_base64: f.data_base64,
      }));

    if (payload.length > 0) {
      kernel.sendInteraction(componentId, { action: "upload", files: payload });
    }
  }

  /** Remove a file from the list (and from Python if already uploaded). */
  function removeFile(key: string) {
    const file = files().find(f => f.key === key);
    if (!file) return;

    if (file.status === "success") {
      // Already uploaded to Python — tell Python to delete it
      kernel.sendInteraction(componentId, { action: "remove", key });
    }

    setFiles(prev => prev.filter(f => f.key !== key));

    // Update form context if in a form
    if (formContext) {
      formContext.setChildValue(componentId, buildFormValue(files().filter(f => f.key !== key)));
    }
  }

  // --- Kernel communication ---
  onMount(() => {
    if (formContext) {
      formContext.registerChild(componentId);
    }

    kernel.registerComponentListener(componentId, (data: any) => {
      // Status ack from Python — just update visual state, do NOT send back
      if (data.upload_status) {
        isProcessingAck = true;
        const statusMap: Record<string, string> = data.upload_status;
        setFiles(prev =>
          prev.map(f => {
            const s = statusMap[f.key];
            if (!s) return f;
            if (s === "success") return { ...f, status: "success" as FileStatus };
            if (s === "removed") return f; // will be filtered out by removeFile
            if (s.startsWith("error:")) return { ...f, status: "error" as FileStatus, error: s.slice(6) };
            return f;
          })
        );
        isProcessingAck = false;
        return;
      }

      // Handle form submission response (files uploaded via form submit path)
      if (data.form_upload_status) {
        isProcessingAck = true;
        const statusMap: Record<string, string> = data.form_upload_status;
        setFiles(prev =>
          prev.map(f => {
            const s = statusMap[f.key];
            if (!s) return f;
            if (s === "success") return { ...f, status: "success" as FileStatus };
            if (s.startsWith("error:")) return { ...f, status: "error" as FileStatus, error: s.slice(6) };
            return f;
          })
        );
        isProcessingAck = false;
        return;
      }

      // Generic prop updates from Python (e.g., disabled, hidden)
      if (!isProcessingAck) {
        setAllProps(prev => ({ ...prev, ...data }));
      }
    });
  });

  onCleanup(() => {
    if (formContext) {
      formContext.unregisterChild(componentId);
    }
    kernel.unregisterComponentListener(componentId);
  });

  // --- Browse click handler ---
  const handleBrowseClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (disabled()) return;
    selectFiles(async (selected) => {
      await processNewFiles(selected);
    });
  };

  // The whole dropzone area should also open file picker on click
  const handleZoneClick = () => {
    if (disabled()) return;
    selectFiles(async (selected) => {
      await processNewFiles(selected);
    });
  };

  // --- Styles ---
  const componentStyles = () => {
    const styles: Record<string, string | number | undefined> = {};
    const grow = allProps().grow;
    const shrink = allProps().shrink;
    const force = allProps().force_dimensions;

    if (hidden()) {
      styles.display = "none";
      return styles;
    }

    if (grow != null) {
      styles["flex-grow"] = grow;
      styles["min-width"] = "0";
      styles["min-height"] = "0";
    }
    if (shrink != null) {
      styles["flex-shrink"] = shrink;
    }

    const width = allProps().width;
    if (width != null) {
      const w = typeof width === "number" ? `${width}px` : width;
      if (force) {
        styles.width = w;
        styles["flex-grow"] = 0;
        styles["flex-shrink"] = 0;
      } else {
        styles.width = w;
      }
    }

    const height = allProps().height;
    if (height != null) {
      const h = typeof height === "number" ? `${height}px` : height;
      if (force) {
        styles.height = h;
      } else {
        styles["min-height"] = h;
      }
    }

    return styles;
  };

  const uploadClass = `upload-${componentId}`;

  /** Default border is 2px dashed, not 2px solid like other components. */
  const borderStyles = (): Record<string, string> => {
    const borderValue = allProps().border;

    // border=false or "none"
    if (borderValue === false || borderValue === "none") {
      return { border: "none" };
    }

    // border=true, null, undefined → default dashed
    if (borderValue === true || borderValue == null) {
      return { border: "2px dashed var(--foreground)" };
    }

    // String preset or custom — resolve through colorUtils (but keep dashed for presets)
    const resolved = resolveBorder(borderValue);
    if (resolved.border) {
      // If user specified a full CSS border string, use it as-is
      // Otherwise make it dashed
      const isFullBorder = typeof borderValue === "string" && borderValue.includes(" ");
      if (isFullBorder) {
        return { border: resolved.border };
      }
      // It's a color preset or custom color → wrap as dashed
      return { border: resolved.border.replace("solid", "dashed") };
    }
    return { border: "2px dashed var(--foreground)" };
  };

  const colorVar = () => resolveColor(allProps().color, "primary");

  const generateStyles = () => {
    const cv = colorVar();
    return `
      .${uploadClass} {
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      .${uploadClass}:hover {
        border-color: ${cv};
      }
      .${uploadClass}.drag-over {
        border-color: ${cv};
        background-color: color-mix(in srgb, ${cv} 6%, transparent);
      }
    `;
  };

  // Status icon color helpers
  const statusColor = (status: FileStatus) => {
    switch (status) {
      case "success": return "var(--success, #22c55e)";
      case "error": return "var(--error, #ef4444)";
      default: return "var(--foreground)";
    }
  };

  return (
    <>
      <style>{generateStyles()}</style>
      <div
        ref={(el) => {
          dropzoneRef(el);
          dropzoneEl = el;
          el.addEventListener("dragleave", handleDragLeave);
          el.addEventListener("drop", handleDrop);
        }}
        class={`${uploadClass} rounded-sm cursor-pointer select-none font-mono ${isDragOver() ? "drag-over" : ""}`}
        style={{
          ...componentStyles(),
          ...borderStyles(),
          ...resolveBackground(allProps().background),
          padding: `${sizeConfig().padding}px`,
          "min-height": allProps().height == null ? "120px" : undefined,
          display: hidden() ? "none" : "flex",
          "flex-direction": "column",
        }}
        onClick={handleZoneClick}
      >
        {/* --- File list (top-left) --- */}
        <Show when={files().length > 0}>
          <div class="flex flex-col w-full" style={{ "margin-bottom": "8px" }}>
            <For each={files()}>
              {(file) => (
                <FileRow
                  file={file}
                  onRemove={removeFile}
                  textSize={sizeConfig().fileTextSize}
                />
              )}
            </For>
          </div>
        </Show>

        {/* --- Center prompt --- */}
        <div
          class="flex flex-col items-center justify-center flex-1 gap-1 pointer-events-none opacity-60"
          style={{ "min-height": "60px" }}
        >
          <UploadCloud size={sizeConfig().iconSize} />
          <span class={`${sizeConfig().textSize} font-semibold`}>{label()}</span>
          <span class={`${sizeConfig().fileTextSize} opacity-70`}>
            Drag & drop files here, or{" "}
            <span
              class="underline pointer-events-auto cursor-pointer opacity-100"
              style={{ color: colorVar() }}
              onClick={handleBrowseClick}
            >
              browse
            </span>
          </span>
        </div>
      </div>
    </>
  );
};

// --- File Row Sub-component ---

interface FileRowProps {
  file: TrackedFile;
  onRemove: (key: string) => void;
  textSize: string;
}

const FileRow: Component<FileRowProps> = (p) => {
  const [hovered, setHovered] = createSignal(false);

  const statusIcon = () => {
    switch (p.file.status) {
      case "success":
        return <CheckCircle size={14} style={{ color: "var(--success, #22c55e)", "flex-shrink": "0" }} />;
      case "error":
        return <XCircle size={14} style={{ color: "var(--error, #ef4444)", "flex-shrink": "0" }} />;
      case "uploading":
        return <Loader size={14} class="animate-spin" style={{ color: "var(--foreground)", opacity: "0.6", "flex-shrink": "0" }} />;
      default:
        return <FileUp size={14} style={{ color: "var(--foreground)", opacity: "0.5", "flex-shrink": "0" }} />;
    }
  };

  const textColor = () => {
    switch (p.file.status) {
      case "success": return "var(--success, #22c55e)";
      case "error": return "var(--error, #ef4444)";
      default: return "var(--foreground)";
    }
  };

  return (
    <div
      class={`flex items-center gap-2 px-2 py-0.5 rounded-sm transition-colors ${p.textSize}`}
      style={{
        "background-color": hovered() ? "var(--foreground-alpha, rgba(128,128,128,0.1))" : "transparent",
        color: textColor(),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {statusIcon()}
      <span class="truncate flex-1 font-mono" style={{ "font-size": "inherit" }}>
        {p.file.name}
      </span>
      <span class="opacity-50 whitespace-nowrap" style={{ "font-size": "inherit" }}>
        {formatSize(p.file.size)}
      </span>
      <button
        class="flex items-center justify-center rounded-sm transition-opacity cursor-pointer"
        style={{
          opacity: hovered() ? "1" : "0",
          width: "18px",
          height: "18px",
          "flex-shrink": "0",
          color: "var(--error, #ef4444)",
          background: "transparent",
          border: "none",
          padding: "0",
        }}
        onClick={(e) => {
          e.stopPropagation();
          p.onRemove(p.file.key);
        }}
        title="Remove file"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default Upload;
