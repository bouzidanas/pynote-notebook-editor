import { type Component, For, Show, Switch, Match, createSignal, onCleanup, createEffect, createMemo, onMount, lazy } from "solid-js";
import { Portal } from "solid-js/web";
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCorners } from "@thisbeyond/solid-dnd";
import { Transition, TransitionGroup } from "solid-transition-group";
import { notebookStore, actions, defaultCells, APP_DEFAULT_EXECUTION_MODE, APP_ENABLE_CELL_DND, flushAllEditors, type ExecutionMode, type CellData } from "../lib/store";
import { isBuiltinNotebook, getBuiltinNotebook } from "../lib/notebooks";
import { isBuiltinTheme, getBuiltinTheme } from "../lib/themes";
import CodeCell from "./CodeCell";
import MarkdownCell from "./MarkdownCell";
import RawCell from "./RawCell";
import CellDrawerToolbar from "./CellDrawerToolbar";
import { Plus, Code, FileText, ChevronDown, StopCircle, RotateCw, RotateCcw, Save, FolderOpen, Download, Undo2, Redo2, X, Eye, Play, Trash2, Keyboard, BookOpen, Activity, EyeOff, Palette, PanelLeft, TriangleAlert } from "lucide-solid";
import { kernel } from "../lib/pyodide";
import Dropdown, { DropdownItem, DropdownDivider } from "./ui/Dropdown";
import { sessionManager, type SessionDocumentData } from "../lib/session";
import { codeVisibility, setVisibilitySettings, resetUserOverride, getSessionState, restoreSessionState, setOnCellOverrideChange, applyDocumentSettings, shouldLoadMetadataSettings, shouldAutoRun, shouldAutoRunOnRefresh } from "../lib/codeVisibility";
import { currentTheme, updateTheme, saveThemeAppWide, loadAppTheme } from "../lib/theme";
import { loadThemeFonts } from "../lib/font-loader";
import { saveFileHandle, loadFileHandle, deleteFileHandle } from "../lib/file-handles";
import { documentFromApp, appNotebookFromDocument } from "../lib/notebook-io";
import { serializeIpynb } from "../lib/formats/ipynb";
import { type JsonObject, type NotebookDocument, isJsonObject, setOwn } from "../lib/formats/document";
import { OPEN_ACCEPT, readNotebookFile } from "../lib/notebook-open";
import { createExecution } from "../lib/execution";
import { host, type EmbeddedNotebook } from "../lib/host";
import { TESTID } from "../lib/testids";
import FileWorkspacePanel from "./FileWorkspacePanel";
import SideShortcuts from "./notebook/SideShortcuts";
import SideLeftPanel from "./notebook/SideLeftPanel";
import { SHORTCUTS } from "./notebook/shortcuts";
import { DragOffsetTracker, CustomDragOverlay, AutoScroller } from "./notebook/dnd-helpers";
import { type FilesPanelViewMode, FILES_PANEL_VIEW_MODE_STORAGE_KEY, loadPersistedFilesPanelViewMode } from "./notebook/files-panel-view-mode";

const PerformanceMonitor = lazy(() => import("./PerformanceMonitor"));
const CodeVisibilityDialog = lazy(() => import("./CodeVisibilityDialog"));
const ThemeDialog = lazy(() => import("./ThemeDialog"));
const ExportDialog = lazy(() => import("./ExportDialog"));

// Sessions saved before the store kept `documentMetadata` stored only the
// loaded document's theme and code visibility; rebuild the equivalent
// metadata from them so re-saving still writes those settings back.
const sessionDocumentMetadata = (data: any): JsonObject => {
  if (isJsonObject(data?.documentMetadata)) return data.documentMetadata;
  const pynote: JsonObject = {};
  if (isJsonObject(data?.loadedDocumentTheme)) pynote.theme = data.loadedDocumentTheme;
  if (isJsonObject(data?.loadedDocumentCodeview)) pynote.codeview = data.loadedDocumentCodeview;
  return Object.keys(pynote).length > 0 ? { PyNote: pynote } : {};
};

// The data an opened document brought that PyNote never edits: the cells'
// attachments and the notebook metadata other than PyNote's settings. A
// session keeps it out of localStorage when it can (see session.ts).
const documentDataOf = (cells: readonly { id: string; attachments?: JsonObject }[], metadata: JsonObject): SessionDocumentData => {
  const attachments: JsonObject = {};
  for (const cell of cells) if (cell.attachments) setOwn(attachments, cell.id, cell.attachments);
  const { PyNote: _settings, ...rest } = metadata;
  return { attachments: attachments as SessionDocumentData["attachments"], metadata: rest };
};

// Where a session's document data is when it is not in its localStorage
// entry: in IndexedDB, or in the standalone export the notebook came from.
type DocumentDataPlace = "indexeddb" | "export";

// Where the open session's document data is, and for IndexedDB the data
// itself, to store it again if the session is dropped while its tab is open.
type DocumentDataHome =
  | { sessionId: string; place: "indexeddb"; data: SessionDocumentData }
  | { sessionId: string; place: "export" };

// The cells and document metadata as the localStorage session stores them:
// without what is kept elsewhere (`aside`), and without the undo history the
// opened document's PyNote settings carry (the session keeps the current one).
const sessionDocumentParts = (cells: readonly CellData[], metadata: JsonObject, aside: DocumentDataPlace | null) => {
  const settings = isJsonObject(metadata.PyNote) ? (({ history: _history, ...rest }) => rest)(metadata.PyNote) : undefined;
  const pynote = settings ? { PyNote: settings } : {};
  return {
    // Spread proxy to plain object first (SolidJS store proxies may not
    // enumerate dynamically-added properties through direct rest
    // destructuring), then exclude transient UI-only keys.
    cells: cells.map((cell) => {
      const { isEditing, isRunning, isQueued, editorAction, canUndo, canRedo, outputs, attachments, ...rest } = { ...cell };
      return aside || !attachments ? rest : { ...rest, attachments };
    }),
    documentMetadata: aside ? pynote : { ...metadata, ...pynote },
    ...(aside === "indexeddb" ? { documentData: aside } : {}),
  };
};

const Notebook: Component = () => {
  let fileInput: HTMLInputElement | undefined;
  // Which host this UI runs in (the app, or a standalone export) decides the
  // file actions it offers. Read once: entry points set it before mounting.
  const hostProfile = host();
  const readOnly = hostProfile.readOnly;
  const [isWideFilesViewport, setIsWideFilesViewport] = createSignal(
    typeof window !== "undefined" && window.matchMedia("(min-width: 96rem)").matches,
  );
  const [draggedHeight, setDraggedHeight] = createSignal<number | null>(null);
  const [grabOffsetX, setGrabOffsetX] = createSignal(0);
  const [cellWidth, setCellWidth] = createSignal(0);
  // Signal for showing the Esc hint in presentation mode
  const [showEscHint, setShowEscHint] = createSignal(false);
  const [showShortcuts, setShowShortcuts] = createSignal(false);
  const [showLeftPanel, setShowLeftPanel] = createSignal(false);
  const [showPerformance, setShowPerformance] = createSignal(false);
  const [showCodeVisibility, setShowCodeVisibility] = createSignal(false);
  const [showThemeDialog, setShowThemeDialog] = createSignal(false);
  const [showExportDialog, setShowExportDialog] = createSignal(false);
  const [sessionHasTheme, setSessionHasTheme] = createSignal(false);
  const [filesPanelViewMode, setFilesPanelViewMode] = createSignal<FilesPanelViewMode>(loadPersistedFilesPanelViewMode());

  const setAndPersistFilesPanelViewMode = (nextMode: FilesPanelViewMode) => {
    setFilesPanelViewMode(nextMode);
    try {
      localStorage.setItem(FILES_PANEL_VIEW_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Ignore storage write failures.
    }
  };
  // Version signal to force re-mounting of the list on full reloads
  const [notebookVersion, ] = createSignal(0);
  
  // File System Access API: Store file handle for saving back to opened file
  let fileHandle: FileSystemFileHandle | null = null;
  
  // One-shot trigger for auto-run, drained by a createEffect once the kernel
  // is ready: "start" for a new session, "refresh" for the same session
  // reloaded, so the cascading toggles below can honor the context. A signal,
  // so a notebook that finishes loading after the kernel is ready still runs.
  const [pendingAutoRun, setPendingAutoRun] = createSignal<"start" | "refresh" | null>(null);

  onMount(() => {
    const mediaQuery = window.matchMedia("(min-width: 96rem)");
    const syncViewport = () => setIsWideFilesViewport(mediaQuery.matches);
    syncViewport();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      onCleanup(() => mediaQuery.removeEventListener("change", syncViewport));
      return;
    }
    mediaQuery.addListener(syncViewport);
    onCleanup(() => mediaQuery.removeListener(syncViewport));
  });

  // How cells run (queue, reactive mode); see src/lib/execution.ts.
  const execution = createExecution();
  const { runCell, runAll, getRedefinitionChecker } = execution;

  // --- Mobile cell action drawer (narrow screens only) -----------------------
  // One persistent drawer rendered once, not per-cell, so switching cells
  // cross-fades in place. `drawerContentCell` keeps the last cell while
  // closing so content doesn't vanish mid-slide.
  const drawerActiveCell = () => notebookStore.cells.find((c) => c.id === notebookStore.activeCellId) ?? null;
  const drawerOpen = () => !!drawerActiveCell() && !notebookStore.presentationMode;
  const drawerContentCell = createMemo<CellData | null>((prev) => drawerActiveCell() ?? prev ?? null);




  const runSelected = () => {
      if (notebookStore.activeCellId) {
          runCell(notebookStore.activeCellId);
      }
  };

  const clearSelectedOutput = () => {
      if (notebookStore.activeCellId) {
          actions.clearCellOutput(notebookStore.activeCellId);
      }
  };
  

  const deleteSelected = () => {
       if (notebookStore.activeCellId) {
          actions.deleteCell(notebookStore.activeCellId);
      }
  };

  const handleDeleteAllCells = () => {
     actions.deleteAllCells();
  };

  const isEditingActive = () => {
    const activeId = notebookStore.activeCellId;
    if (!activeId) return false;
    const cell = notebookStore.cells.find(c => c.id === activeId);
    return !!cell?.isEditing;
  };

  const getUndoDisabled = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
        const cell = notebookStore.cells.find(c => c.id === activeId);
        // If we have exposed state (CodeEditor), check depth
        // For Markdown/Milkdown we don't have easy access to depth, so we keep it enabled
        if (cell?.canUndo !== undefined) {
             return !cell.canUndo;
        }
        return true; // Default to disabled while loading
    }
    return notebookStore.historyIndex < 0;
  };

  const getRedoDisabled = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
        const cell = notebookStore.cells.find(c => c.id === activeId);
        // If we have exposed state (CodeEditor), check depth
        if (cell?.canRedo !== undefined) {
             return !cell.canRedo;
        }
        return true; // Default to disabled while loading
    }
    return notebookStore.historyIndex >= notebookStore.history.length - 1;
  };

  const handleUndo = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
        if (activeId) {
             actions.dispatchEditorAction(activeId, "undo");
             return;
        }
    }
    actions.undo();
  };

  const handleRedo = () => {
    if (isEditingActive()) {
        const activeId = notebookStore.activeCellId;
         if (activeId) {
             actions.dispatchEditorAction(activeId, "redo");
             return;
        }
    }
    actions.redo();
  };


  // Keyboard Shortcuts
  onMount(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // Resolve state early
      const activeId = notebookStore.activeCellId;
      const activeCell = activeId ? notebookStore.cells.find(c => c.id === activeId) : null;
      const activeIndex = activeId ? notebookStore.cells.findIndex(c => c.id === activeId) : -1;
      const isEditing = activeCell?.isEditing;

      // Global Shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "s") {
        // Ctrl+Shift+S = Save As (must check before Ctrl+S)
        e.preventDefault();
        handleSaveAs();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        if (hostProfile.openFiles) handleOpenFile();
      } else if (e.altKey && e.key === "n" && hostProfile.newNotebook) { // Alt + N for New
        e.preventDefault();
        // Redirect to a completely new session URL
        const url = sessionManager.createNewSessionUrl();

        // Option A: Same Tab (History Push)
        //           In the future we might want to provide both options: open new document in same tab or new tab
        //           So we leave this commented for now.
        // window.location.href = url;
        
        // Option B: New Tab
        window.open(url, '_blank');
      } else if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        if (hostProfile.exportDialog) setShowExportDialog(true);
      } else if (!isEditing && (e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        // Global Undo/Redo (Only when NOT editing)
        if (e.shiftKey) {
           e.preventDefault();
           actions.redo();
        } else {
           e.preventDefault();
           actions.undo();
        }
      } else if (!isEditing && (e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
         // Global Redo (Windows style)
         e.preventDefault();
         actions.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "\\") {

        e.preventDefault();
        setShowShortcuts(!showShortcuts());
      } else if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        setShowLeftPanel(!showLeftPanel());
      } else if (e.altKey && e.key === "p") {
        e.preventDefault();
        if (!readOnly) actions.setPresentationMode(!notebookStore.presentationMode);
      } else if (e.altKey && e.key === "t") {
        e.preventDefault();
        setShowThemeDialog(!showThemeDialog());
      } else if (e.altKey && e.key === "v") {
        e.preventDefault();
        setShowCodeVisibility(!showCodeVisibility());
      } else if (e.altKey && e.key === "r") {
        e.preventDefault();
        runAll();
      } else if (e.altKey && e.key === "Backspace") {
        e.preventDefault();
        actions.clearAllOutputs();
      } else if (e.altKey && e.key === "Delete") {
        e.preventDefault();
        handleDeleteAllCells();
      } else if (e.altKey && e.key === "k") {
        e.preventDefault();
        actions.restartKernel();
      } else if (e.altKey && e.key === "q") {
        e.preventDefault();
        actions.shutDownKernel();
      } else if (e.ctrlKey && e.key === "Backspace") {
        if (notebookStore.activeCellId) {
             e.preventDefault();
             actions.clearCellOutput(notebookStore.activeCellId);
        }
      }

      if (isEditing) {

        // Edit Mode Shortcuts
        if (e.key === "Enter" && e.shiftKey) {
            // Run & Edit Next
            e.preventDefault();
            if (activeId) {
                runCell(activeId);
                // Exit current edit
                actions.setEditing(activeId, false);
                // Move to next or insert
                if (activeIndex < notebookStore.cells.length - 1) {
                    const nextId = notebookStore.cells[activeIndex + 1].id;
                    actions.setActiveCell(nextId);
                    actions.setEditing(nextId, true);
                } else {
                    // Insert same type below
                    actions.addCell(activeCell?.type || "code");
                }
            }
        } else if (e.key === "Enter" && e.ctrlKey) {
            // Run & Stay (Exit Edit Mode for Markdown, Stay for Code)
            e.preventDefault();
            if (activeId) {
                runCell(activeId);
                // Only exit edit mode if it's a markdown cell
                if (activeCell?.type === "markdown") {
                    actions.setEditing(activeId, false);
                }
            }
        } else if (e.key === "Enter" && e.altKey) {
            // Run & Insert Below (Edit new)
            e.preventDefault();
            if (activeId) {
                runCell(activeId);
                actions.setEditing(activeId, false);
                actions.addCell(activeCell?.type || "code", activeIndex + 1);
            }
        } else if (e.key === "Escape") {
             // Exit Edit Mode
             if (activeId) actions.setEditing(activeId, false);
        }
      } else if (activeId) {
        // Command/Selected Mode Shortcuts (when not editing).
        // Single-letter shortcuts fire only without modifiers, so chords that
        // share the letter (Ctrl+Y redo, Alt+R run all, Ctrl+A) don't also
        // insert cells or change the selected cell's type.
        const plainKey = !e.ctrlKey && !e.metaKey && !e.altKey;
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
             e.preventDefault();
             actions.setEditing(activeId, true);
        } else if (e.key === "Escape") {
             // Deselect
             e.preventDefault();
             actions.setActiveCell(null);
        } else if (e.key === "ArrowUp" && (e.altKey || (e.ctrlKey && e.shiftKey))) {
             // Move Up
             e.preventDefault();
             if (activeIndex > 0) {
                 actions.moveCell(activeIndex, activeIndex - 1);
             }
        } else if (e.key === "ArrowDown" && (e.altKey || (e.ctrlKey && e.shiftKey))) {
             // Move Down
             e.preventDefault();
             if (activeIndex < notebookStore.cells.length - 1) {
                 actions.moveCell(activeIndex, activeIndex + 1);
             }
        } else if (e.key === "ArrowUp") {
             e.preventDefault();
             if (activeIndex > 0) actions.setActiveCell(notebookStore.cells[activeIndex - 1].id);
        } else if (e.key === "ArrowDown") {
             e.preventDefault();
             if (activeIndex < notebookStore.cells.length - 1) actions.setActiveCell(notebookStore.cells[activeIndex + 1].id);
        } else if (plainKey && (e.key === "a" || e.key === "A")) { // Insert Above (Same Type)
             actions.addCell(activeCell?.type || "code", activeIndex);
        } else if (plainKey && (e.key === "b" || e.key === "B")) { // Insert Below (Same Type)
             actions.addCell(activeCell?.type || "code", activeIndex + 1);
        } else if (e.key === "Delete" && (e.ctrlKey || e.metaKey)) {
             e.preventDefault();
             actions.deleteCell(activeId);
        } else if (plainKey && (e.key === "m" || e.key === "M")) {
             actions.changeCellType(activeId, "markdown");
        } else if (plainKey && (e.key === "y" || e.key === "Y")) {
             actions.changeCellType(activeId, "code");
        } else if (plainKey && (e.key === "r" || e.key === "R")) {
             actions.changeCellType(activeId, "raw");
        } else if (e.key === "Enter" && e.shiftKey) {
            // Run & Select Next
            e.preventDefault();
            runCell(activeId);
            if (activeIndex < notebookStore.cells.length - 1) {
                actions.setActiveCell(notebookStore.cells[activeIndex + 1].id);
            }
        } else if (e.key === "Enter" && e.ctrlKey) {
            // Run & Stay Selected
            e.preventDefault();
            runCell(activeId);
        } else if (e.key === "Enter" && e.altKey) {
             // Run & Insert Below (Edit new) - "run and insert new cell ... automatically in editing mode"
            e.preventDefault();
            runCell(activeId);
            actions.addCell(activeCell?.type || "code", activeIndex + 1);
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeydown);
    onCleanup(() => window.removeEventListener("keydown", handleGlobalKeydown));
  });

  // Debounce utility for autosave - batches rapid mutations into a single save
  let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;
  const AUTOSAVE_DEBOUNCE_MS = 300;
  // Set when the session was deleted on purpose (reset) right before a reload,
  // so the unload flush does not write it back.
  let sessionDiscarded = false;

  // Where the open session's document data (attachments and the metadata
  // other than PyNote's, see session.ts) is kept when not in its localStorage
  // entry: in IndexedDB once stored there, or in the standalone export it came
  // from. Its autosaves leave that data out.
  let documentDataHome: DocumentDataHome | null = null;
  // The open session once this tab has it in storage (saved or restored it).
  // Another tab can still drop it from storage (one that had not seen this
  // tab's lock, or in a browser without Web Locks), and with it what is kept
  // beside its localStorage entry: the next autosave stores all of it again.
  let storedSessionId: string | null = null;
  // Set while a session is being restored: its notebook is not in the store
  // yet, so there is nothing to autosave.
  let restoringSession = false;
  // Whether the browser could not keep the notebook's latest state (storage
  // full or unavailable): reloading or closing the tab would lose it, so the
  // toolbar says so.
  const [autosaveFailed, setAutosaveFailed] = createSignal(false);
  // Whether the browser lost the attachments and metadata of the open session
  // (see restoreNotebook), so the toolbar says so.
  const [documentDataLost, setDocumentDataLost] = createSignal(false);

  const documentDataPlace = (sessionId: string): DocumentDataPlace | null =>
    documentDataHome?.sessionId === sessionId ? documentDataHome.place : null;

  // Stores again what a session keeps beside its localStorage entry (its
  // document data in IndexedDB, the opened file's handle), which went with
  // it when it was dropped from storage. Its next save refers to the document
  // data while this write is under way: a reload in between finds it missing
  // and says so, which is better than a session that does not refer to it.
  const storeSessionExtras = (sessionId: string) => {
    const home = documentDataHome;
    if (home?.sessionId === sessionId && home.place === "indexeddb") {
      void sessionManager.saveDocumentData(sessionId, home.data).then((stored) => {
        if (stored || documentDataHome !== home) return;
        // IndexedDB refused it: keep it in the localStorage session instead.
        documentDataHome = null;
        autosaveNotebook();
      });
    }
    if (fileHandle) void saveFileHandle(sessionId, fileHandle);
  };

  // Save notebook state to localStorage (internal, not user-controlled)
  function autosaveNotebookImmediate() {
    if (restoringSession) return;
    const sessionId = sessionManager.getSessionIdFromUrl();
    if (!sessionId) {
      // Should not happen for normal sessions, but if it does (e.g. user manually removed param),

      // we don't save to avoid polluting "null" key.
      return;
    }
    void sessionManager.holdSession(sessionId);
    if (storedSessionId === sessionId && !sessionManager.isStored(sessionId)) {
      storedSessionId = null;
      storeSessionExtras(sessionId);
    }

    // Only save essential notebook state (cells, filename, history, historyIndex)
    // Cells drop transient UI-only keys that are meaningless after reload.
    // Outputs are intentionally not persisted: they are live kernel results
    // (pynote_ui components and built-in plots can't be restored without a
    // kernel anyway) and cells that haven't run after a reload should show
    // none. Opt-in output persistence is a planned future feature.
    const data = {
      filename: notebookStore.filename,
      history: notebookStore.history,
      historyIndex: notebookStore.historyIndex,
      activeCellId: notebookStore.activeCellId,
      executionMode: notebookStore.executionMode, // Persist session execution mode
      showTrailingAddButtons: notebookStore.showTrailingAddButtons, // Persist trailing add buttons setting
      notebookAutorun: notebookStore.notebookAutorun, // Persist notebook-level autorun preference
      notebookAutorunOnRefresh: notebookStore.notebookAutorunOnRefresh, // Persist notebook-level refresh-scope toggle
      codeHiddenPlaceholder: notebookStore.codeHiddenPlaceholder, // Persist hidden-code placeholder
      theme: sessionHasTheme() ? { ...currentTheme } : undefined,
      codeVisibility: getSessionState(), // Persist code visibility settings & cell overrides
      // The cells, and the loaded document's metadata (kernelspec, other
      // tools' keys and its original PyNote settings), so it survives a page
      // refresh and is written back on save. The attachments and that
      // metadata stay out when kept elsewhere.
      ...sessionDocumentParts(notebookStore.cells, notebookStore.documentMetadata, documentDataPlace(sessionId)),
      // A loss found when the session was restored stays known.
      ...(documentDataLost() ? { documentData: "lost" } : {}),
    };
    
    const saved = sessionManager.saveSession(sessionId, data);
    if (saved) storedSessionId = sessionId;
    // The first save to fail may have needed room that a notebook no tab
    // shows any more would make, which this tab still counted as shown (its
    // tab closed since this one last looked, see session.ts): once it has
    // looked again, it tries once more.
    else if (!autosaveFailed()) void sessionManager.refreshOpenSessions().then(retryAutosave);
    setAutosaveFailed(!saved);
  }

  // A save tried again, unless the session was discarded or a save is due
  // anyway.
  function retryAutosave() {
    if (!sessionDiscarded && !autosaveTimeout) autosaveNotebookImmediate();
  }

  // Debounced autosave - batches rapid changes into a single localStorage write
  function autosaveNotebook() {
    if (autosaveTimeout) {
      clearTimeout(autosaveTimeout);
    }
    autosaveTimeout = setTimeout(() => {
      autosaveNotebookImmediate();
      autosaveTimeout = null;
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // Set up callback for cell visibility override changes to trigger autosave
  setOnCellOverrideChange(() => autosaveNotebook());

  // Restore notebook state from its session (if there is one). Resolves to
  // whether there was one; its notebook is shown once its document data is
  // back: from IndexedDB, or from `exported`, the document a standalone
  // export carries.
  async function restoreNotebook(exported?: NotebookDocument): Promise<boolean> {
    const sessionId = sessionManager.getSessionIdFromUrl();
    if (!sessionId) return false;

    const data = sessionManager.loadSession(sessionId);
    if (!data || !Array.isArray(data.cells)) return false;
    storedSessionId = sessionId;
    // Other tabs leave the session alone from now on. It counts as used once
    // the lock is held, so a tab that changes the list of sessions next sees
    // the lock too.
    void sessionManager.holdSession(sessionId).then(() => sessionManager.touchSession(sessionId, data.filename || "Untitled.ipynb"));

    // The look first (all of it is in localStorage), so the page never shows
    // the notebook with the wrong theme while its document data loads.
    if (data.theme) {
      updateTheme(data.theme);
      setSessionHasTheme(true);
    } else {
      setSessionHasTheme(false);
    }

    // Restore code visibility state if session has it
    if (data.codeVisibility) {
      restoreSessionState(data.codeVisibility);
    }

    let documentData: SessionDocumentData | null = null;
    // Whether the browser lost the document data since the last load (the
    // session remembers a loss found before: documentData "lost").
    let documentDataLost = false;
    if (exported) {
      documentData = documentDataOf(exported.cells, exported.metadata);
    } else if (data.documentData === "indexeddb") {
      restoringSession = true;
      try {
        documentData = await sessionManager.loadDocumentData(sessionId);
      } finally {
        restoringSession = false;
      }
      if (documentData) documentDataHome = { sessionId, place: "indexeddb", data: documentData };
      else documentDataLost = true;
    }
    setDocumentDataLost(documentDataLost || data.documentData === "lost");

    // Restore the opened file's handle (persisted in IndexedDB; survives
    // reloads unlike the localStorage session). Save re-requests write
    // permission if the browser dropped it. When the browser lost the
    // notebook's attachments and metadata, the handle is forgotten for good:
    // saving over the file would drop them from it, so Save asks where to
    // save instead (the toolbar says why). A file saved to since is the
    // handle a later load finds.
    if (documentDataLost) {
      console.warn("This notebook's attachments and metadata are no longer in the browser's storage, so Save asks where to save it.");
      void deleteFileHandle(sessionId);
    } else {
      loadFileHandle(sessionId).then((h) => {
        if (h && !fileHandle) fileHandle = h;
      });
    }

    // Sanitize cells to ensure no stale running state. Also drop outputs
    // that older sessions saved before outputs were excluded from
    // persistence; a cell that hasn't run this load has no output.
    const sanitizedCells = data.cells.map((c: any) => {
      const attachments = c.attachments ?? (documentData && Object.hasOwn(documentData.attachments, c.id) ? documentData.attachments[c.id] : undefined);
      return {
        ...c,
        isRunning: false,
        isQueued: false,
        outputs: undefined,
        ...(attachments ? { attachments } : {}),
      };
    });

    // Validate execution mode from session (or fall back to app default)
    const validModes: ExecutionMode[] = ["queue_all", "hybrid", "direct", "reactive"];
    const sessionExecutionMode = validModes.includes(data.executionMode) 
      ? data.executionMode as ExecutionMode 
      : APP_DEFAULT_EXECUTION_MODE;

    actions.loadNotebook(
      sanitizedCells,
      data.filename || "Untitled.ipynb",
      data.history || [],
      typeof data.historyIndex === "number" ? data.historyIndex : undefined,
      data.activeCellId,
      sessionExecutionMode,
      typeof data.showTrailingAddButtons === "boolean" ? data.showTrailingAddButtons : undefined,
      typeof data.notebookAutorun === "boolean"
        ? data.notebookAutorun
        : undefined,
      typeof data.codeHiddenPlaceholder === "string" ? data.codeHiddenPlaceholder : undefined,
      typeof data.notebookAutorunOnRefresh === "boolean" ? data.notebookAutorunOnRefresh : undefined,
      { ...documentData?.metadata, ...sessionDocumentMetadata(data) },
    );
    return true;
  }


  // Apply a built-in theme from the ?theme= query param.
  // Works with any notebook (builtin, restored, new). The theme is injected as an
  // override, marked for save-to-export, and the param is cleaned from the URL.
  const applyThemeParam = (themeParam: string | null) => {
    if (!isBuiltinTheme(themeParam)) return;
    const themeData = getBuiltinTheme(themeParam);
    updateTheme({ ...themeData, saveToExport: true });
    setSessionHasTheme(true);
    // Store as the loaded document theme so it persists on re-save even if
    // the user later turns saveToExport off
    const meta = notebookStore.documentMetadata;
    const pynote = isJsonObject(meta.PyNote) ? meta.PyNote : {};
    actions.setDocumentMetadata({ ...meta, PyNote: { ...pynote, theme: JSON.parse(JSON.stringify(themeData)) } });
    // Clean the param from the URL (one-shot injection)
    const url = new URL(window.location.href);
    url.searchParams.delete("theme");
    window.history.replaceState({}, "", url.toString());
    // Persist immediately so the theme survives a page refresh
    autosaveNotebook();
  };

  // A standalone export shows the notebook it carries. Its theme and view
  // settings were applied when the stores loaded (see host.ts). Interactive
  // exports keep the reader's edits in a session named after the export, so
  // reopening the file continues where they left off ("Reset notebook"
  // discards them); read-only exports show the saved outputs.
  const loadEmbeddedNotebook = async (embedded: EmbeddedNotebook) => {
    const showEmbedded = () => {
      const loaded = appNotebookFromDocument(embedded.document);
      for (const warning of loaded.warnings) console.warn("Embedded notebook:", warning);
      const { settings } = loaded;
      actions.loadNotebook(
        loaded.cells,
        embedded.filename,
        settings.history,
        settings.history.length - 1,
        null,
        settings.executionMode || APP_DEFAULT_EXECUTION_MODE,
        settings.showTrailingAddButtons,
        settings.autorun,
        settings.codeHiddenPlaceholder,
        settings.autorunOnRefresh,
        loaded.metadata,
      );
      setSessionHasTheme(true);
    };

    if (embedded.mode === "readonly") {
      showEmbedded();
      for (const [cellId, outputs] of Object.entries(embedded.outputs ?? {})) actions.updateCellOutput(cellId, outputs);
      actions.setPresentationMode(true);
      return;
    }

    if (!sessionManager.getSessionIdFromUrl()) sessionManager.setSessionIdInUrl(`export-${embedded.exportId}`);
    documentDataHome = { sessionId: sessionManager.getSessionIdFromUrl()!, place: "export" };
    if (await restoreNotebook(embedded.document)) {
      setPendingAutoRun("refresh");
      return;
    }
    showEmbedded();
    autosaveNotebook();
    setPendingAutoRun("start");
    if (embedded.startInPresentation) actions.setPresentationMode(true);
  };

  // Standalone exports: discard the reader's local edits and show the
  // notebook exactly as it was exported.
  const resetEmbeddedNotebook = () => {
    if (!confirm("Discard your changes and restore the notebook as it was exported?")) return;
    const sessionId = sessionManager.getSessionIdFromUrl();
    if (sessionId) sessionManager.deleteSession(sessionId);
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
    sessionDiscarded = true;
    window.location.reload();
  };

  // On mount, restore autosaved notebook if present, else load default cells
  onMount(() => {
    void openStartupNotebook();
  });

  const openStartupNotebook = async () => {
    // Which sessions other tabs have open, known before the first save could
    // drop any (see session.ts).
    void sessionManager.refreshOpenSessions();
    const params = new URLSearchParams(window.location.search);
    const openParam = params.get("open");
    const themeParam = params.get("theme");
    const builtinType = isBuiltinNotebook(openParam) ? openParam : null;
    let sessionId = sessionManager.getSessionIdFromUrl();

    // Standalone export: its own notebook (the built-in tutorial still opens
    // through ?open=tutorial, like in the app).
    if (hostProfile.embedded && !builtinType) {
      await loadEmbeddedNotebook(hostProfile.embedded);
      return;
    }

    // Handle Built-in Notebook Initialization (Fresh)
    if (builtinType && !sessionId) {
      // Create new session ID for the tutorial
      sessionId = crypto.randomUUID();
      const url = new URL(window.location.href);
      url.searchParams.set("session", sessionId);
      window.history.replaceState({}, "", url.toString());

      // Load app theme for new session
      updateTheme(loadAppTheme());

      const { cells, filename, codeview, showTrailingAddButtons, autorun, autorunOnRefresh, codeHiddenPlaceholder, executionMode: builtinExecMode, outputLayout: builtinOutputLayout } = getBuiltinNotebook(builtinType);

      // Reset user override flag for fresh notebook load
      resetUserOverride();

      // Apply notebook-specific code visibility settings if present (respects loadMetadataOnDocumentLoad flag)
      if (codeview && shouldLoadMetadataSettings()) {
        applyDocumentSettings(codeview);
      }

      // Apply notebook-specific output position (theme override) if present
      if (builtinOutputLayout) {
        updateTheme({ outputLayout: builtinOutputLayout });
        // Mark session as having a theme so the override persists across refreshes
        setSessionHasTheme(true);
      }

      actions.loadNotebook(
        [...cells],
        filename,
        [],
        undefined,
        undefined,
        builtinExecMode,
        showTrailingAddButtons,
        autorun,
        codeHiddenPlaceholder,
        autorunOnRefresh,
      );
      autosaveNotebook();

      // Apply theme from ?theme= param if present (overrides app theme)
      applyThemeParam(themeParam);

      // Mark as new session for auto-run
      setPendingAutoRun("start");
      return;
    }

    // New Session Handling (Normal)
    if (!sessionId) {
        // First visit or cleared URL - Create new session
        const newUrl = sessionManager.createNewSessionUrl();
        window.history.replaceState({}, '', newUrl);
        
        // Load app theme for new session
        updateTheme(loadAppTheme());
        
        // Start fresh
        actions.loadNotebook([...defaultCells], "Untitled.ipynb", []);
        // Force immediate save to establish the session in index
        autosaveNotebook();
        
        // Mark for auto-run
        setPendingAutoRun("start");
    } else {
        const restored = await restoreNotebook();
        
        // If no session or no session theme, load app theme
        if (!restored || !sessionHasTheme()) {
          updateTheme(loadAppTheme());
        }
        
        if (!restored) {
            // ID exists but data is gone (expired/deleted)
            if (builtinType) {
                 // Built-in notebook link with invalid/expired session -> Reload
                 const { cells, filename, codeview, showTrailingAddButtons, autorun, autorunOnRefresh, codeHiddenPlaceholder, executionMode: builtinExecMode, outputLayout: builtinOutputLayout } = getBuiltinNotebook(builtinType);

                 // Reset user override flag for fresh notebook load
                 resetUserOverride();

                 // Apply notebook-specific code visibility settings if present
                 if (codeview) {
                   setVisibilitySettings(codeview, false); // false = not a user change
                 }

                 // Apply notebook-specific output position (theme override) if present
                 if (builtinOutputLayout) {
                   updateTheme({ outputLayout: builtinOutputLayout });
                   setSessionHasTheme(true);
                 }

                 actions.loadNotebook(
                   [...cells],
                   filename,
                   [],
                   undefined,
                   undefined,
                   builtinExecMode,
                   showTrailingAddButtons,
                   autorun,
                   codeHiddenPlaceholder,
                   autorunOnRefresh,
                 );
            } else {
                 // Normal link with invalid/expired session -> New Notebook
                 actions.loadNotebook([...defaultCells], "Untitled.ipynb", []);
            }
             autosaveNotebook();

            // Mark for auto-run (data was gone/expired)
            setPendingAutoRun("start");
        }
        // If restored === true, this is a page refresh, so flag the refresh-scope
        // event so the cascade below can decide whether to fire.
        if (restored === true) {
          setPendingAutoRun("refresh");
        }
    }

    // Apply theme from ?theme= param if present (overrides any loaded theme)
    applyThemeParam(themeParam);
  };

  // Auto-run cells when kernel becomes ready. Two toggles, each resolved
  // cell > notebook > app: autorun (master on/off) and autorunOnRefresh
  // (whether a page refresh counts).
  createEffect(() => {
    const trigger = pendingAutoRun();
    if (!trigger || kernel.status !== "ready") return;

    const isRefresh = trigger === "refresh";
    setPendingAutoRun(null);

    const appAutorun = shouldAutoRun();
    const appRefresh = shouldAutoRunOnRefresh();
    const nbAutorun = notebookStore.notebookAutorun;
    const nbRefresh = notebookStore.notebookAutorunOnRefresh;

    for (const cell of notebookStore.cells) {
      if (cell.type !== "code") continue;
      const py = cell.metadata?.pynote;
      const resolvedAutorun = py?.autorun ?? nbAutorun ?? appAutorun;
      if (!resolvedAutorun) continue;
      if (isRefresh) {
        const resolvedRefresh = py?.autorunOnRefresh ?? nbRefresh ?? appRefresh;
        if (!resolvedRefresh) continue;
      }
      runCell(cell.id);
    }
  });


  // Provide autosaveNotebook to the store for use in setEditing
  actions.__setAutosaveCallback?.(autosaveNotebook);

  // Save pending edits now when the page is going away (reload, tab close,
  // navigation, or hidden on mobile, where the page may be discarded without
  // an unload): the debounced autosave would drop the last ones. Editors
  // flush first so text still inside their own debounce is included.
  const flushAutosave = () => {
    if (sessionDiscarded) return;
    flushAllEditors();
    if (!autosaveTimeout) return;
    clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
    autosaveNotebookImmediate();
  };
  // A tab that comes back (shown again, or out of the back/forward cache)
  // stores its session again right away if it was dropped meanwhile, so a
  // reload before the next edit still finds it.
  const storeIfDropped = () => {
    const sessionId = sessionManager.getSessionIdFromUrl();
    if (sessionDiscarded || !sessionId || storedSessionId !== sessionId || sessionManager.isStored(sessionId)) return;
    autosaveNotebookImmediate();
  };
  const flushWhenHidden = () => {
    if (document.visibilityState === "hidden") flushAutosave();
    else storeIfDropped();
  };
  const storeIfDroppedOnShow = (event: PageTransitionEvent) => {
    if (event.persisted) storeIfDropped();
  };
  window.addEventListener("pagehide", flushAutosave);
  window.addEventListener("pageshow", storeIfDroppedOnShow);
  document.addEventListener("visibilitychange", flushWhenHidden);
  onCleanup(() => {
    window.removeEventListener("pagehide", flushAutosave);
    window.removeEventListener("pageshow", storeIfDroppedOnShow);
    document.removeEventListener("visibilitychange", flushWhenHidden);
    flushAutosave();
  });

  // Show the Esc hint for 2.5 seconds when entering presentation mode
  createEffect(() => {
    if (notebookStore.presentationMode) {
      setShowEscHint(true);
      const timeout = setTimeout(() => setShowEscHint(false), 2500);
      onCleanup(() => clearTimeout(timeout));
    }
  });

  // Keyboard listener for exiting presentation mode
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && notebookStore.presentationMode && !readOnly) {
        actions.setPresentationMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const onDragStart = ({ draggable }: any) => {
    if (draggable.node) {
      const rect = draggable.node.getBoundingClientRect();
      setDraggedHeight(rect.height);
      setCellWidth(rect.width);
    }
  };

  const onDragEnd = ({ draggable, droppable }: any) => {
    setDraggedHeight(null);

    if (draggable && droppable) {
      const fromIndex = notebookStore.cells.findIndex((c) => c.id === draggable.id);
      const toIndex = notebookStore.cells.findIndex((c) => c.id === droppable.id);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        actions.moveCell(fromIndex, toIndex);
      }
    }
  };

  // --- Notebook files: .ipynb (the default) and .pynote ----------------------
  // The format follows the file name, so Save writes back in the format the
  // notebook was opened or last saved in. The .pynote module (and its YAML
  // dependency) is only loaded when a .pynote file is involved.
  const isPynoteName = (name: string) => /\.pynote$/i.test(name);

  const NOTEBOOK_FILE_TYPES = {
    ipynb: { description: "Jupyter Notebook", accept: { "application/x-ipynb+json": [".ipynb"] } },
    pynote: { description: "PyNote Notebook", accept: { "text/x-pynote": [".pynote"] } },
  };

  // The open notebook serialized for `name` (flushes editors first via documentFromApp).
  const notebookFileContent = async (name: string): Promise<string> => {
    const doc = documentFromApp();
    if (!isPynoteName(name)) return serializeIpynb(doc);
    const { serializePynote } = await import("../lib/formats/pynote");
    return serializePynote(doc);
  };

  // Download file as fallback (browsers without the File System Access API)
  const downloadFile = (content: string, filename: string) => {
    const type = isPynoteName(filename) ? "text/markdown" : "application/x-ipynb+json";
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const writeToHandle = async (handle: FileSystemFileHandle) => {
    const content = await notebookFileContent(handle.name);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  };

  // Save using File System Access API's save picker. Offers both formats; the
  // current file's format comes first (so it is the default), and .ipynb for
  // a notebook that has never been saved.
  const saveWithPicker = async (suggestedName: string): Promise<boolean> => {
    if (!('showSaveFilePicker' in window)) return false;
    
    try {
      const types = isPynoteName(suggestedName)
        ? [NOTEBOOK_FILE_TYPES.pynote, NOTEBOOK_FILE_TYPES.ipynb]
        : [NOTEBOOK_FILE_TYPES.ipynb, NOTEBOOK_FILE_TYPES.pynote];
      // The picker runs first, while the user gesture is fresh; the content
      // (which may need the .pynote module) is built for the chosen name.
      const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({ suggestedName, types });
      await writeToHandle(handle);
      
      // Update fileHandle for future saves (and future reloads)
      fileHandle = handle;
      const sid = sessionManager.getSessionIdFromUrl();
      if (sid) void saveFileHandle(sid, handle);
      if (handle.name !== notebookStore.filename) actions.setFilename(handle.name);
      
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') return true; // User cancelled, don't fallback
      console.warn("Save picker failed:", err);
      return false;
    }
  };

  const handleSave = async () => {
    const filename = notebookStore.filename || "Untitled.ipynb";
    
    // If we have a file handle from opening a file, save directly to it
    if (fileHandle) {
      try {
        // A handle restored after a reload may have lost write permission;
        // re-request it here (Save is a user gesture, so prompting is allowed).
        const h = fileHandle as any;
        if (h.queryPermission && (await h.queryPermission({ mode: "readwrite" })) !== "granted") {
          if ((await h.requestPermission?.({ mode: "readwrite" })) !== "granted") {
            throw new Error("write permission not granted");
          }
        }
        await writeToHandle(fileHandle);
        return; // Success
      } catch (err) {
        // Permission denied or other error - fall through to picker/download
        console.warn("Failed to save to file handle:", err);
      }
    }
    
    // No file handle - try save picker (for new documents in supported browsers)
    if (await saveWithPicker(filename)) return;
    
    // Fallback: Download the file
    downloadFile(await notebookFileContent(filename), filename);
  };

  const handleSaveAs = async () => {
    const filename = notebookStore.filename || "Untitled.ipynb";
    
    // Try save picker first
    if (await saveWithPicker(filename)) return;
    
    // Fallback: Download the file
    downloadFile(await notebookFileContent(filename), filename);
  };

  // Open the notebook the user picked (.ipynb or .pynote). A file picked
  // through the File System Access API loads in place and stays the Save
  // target; the fallback file input has no handle, so it reloads into a new
  // session.
  const openPicked = async (file: { name: string; content: string; handle: FileSystemFileHandle | null }) => {
    const result = await readNotebookFile(file);
    if (!result.ok) {
      console.error(result.error);
      alert(result.error);
      return;
    }
    await loadDocument(result.document, result.warnings, file.name, file.handle);
  };

  const loadDocument = async (
    document: NotebookDocument,
    warnings: string[],
    filename: string,
    handle: FileSystemFileHandle | null,
  ) => {
    const loaded = appNotebookFromDocument(document);
    for (const warning of [...warnings, ...loaded.warnings]) console.warn(`Opening ${filename}:`, warning);
    const { cells: newCells, settings } = loaded;
    const history = settings.history;

    // Document code visibility settings apply as session state (start with the
    // current settings, overlay the document's).
    const documentVisibilityState = settings.codeview && shouldLoadMetadataSettings()
      ? {
          settings: { ...codeVisibility, ...settings.codeview },
          cellOverrides: {} as Record<string, boolean>,
          userHasOverridden: false, // Document settings, not user override
        }
      : null;

    const themeData = settings.theme;

    // The notebook opens as a new session. Its attachments and metadata go to
    // IndexedDB first (see session.ts), so the session never refers to
    // document data that is not stored yet.
    const newSessionId = crypto.randomUUID();
    const documentData = documentDataOf(newCells, loaded.metadata);
    const documentStored = await sessionManager.saveDocumentData(newSessionId, documentData);

    // No file handle (fallback path) - use page reload approach: store the
    // notebook as the new session and load that, so Back returns to the
    // previous notebook.
    if (!handle) {
      const sessionData = {
        filename: filename,
        history: history,
        historyIndex: history.length - 1,
        activeCellId: null,
        executionMode: settings.executionMode, // Document's execution mode (or undefined for app default)
        showTrailingAddButtons: settings.showTrailingAddButtons, // Document's trailing add buttons setting
        notebookAutorun: settings.autorun,
        notebookAutorunOnRefresh: settings.autorunOnRefresh,
        codeHiddenPlaceholder: settings.codeHiddenPlaceholder,
        theme: themeData || undefined,
        codeVisibility: documentVisibilityState || undefined,
        // The cells and the document's metadata, written back on save
        ...sessionDocumentParts(newCells, loaded.metadata, documentStored ? "indexeddb" : null),
      };

      if (sessionManager.saveSession(newSessionId, sessionData)) {
        // Navigate to the new session URL (pushes to history so Back works)
        const url = new URL(window.location.href);
        url.searchParams.set("session", newSessionId);
        url.searchParams.delete("open"); // Clear tutorial param if present
        window.location.assign(url.toString()); // Re-loads with new session
        return;
      }
      // The browser could not keep it (storage full or unavailable), so there
      // is no session to load: open it in this page instead, where the
      // toolbar says it is not autosaved.
    }

    // Load directly without a page reload: keeps the file handle (and opens
    // a notebook the browser could not store).
    // Apply theme if document has one. Give any Google fonts the theme
    // references a short head start (bounded, so opening a file never
    // hangs on the network) so the font usually arrives in the same
    // paint as the rest of the theme. Past the cap it swaps in when
    // ready instead.
    if (themeData) {
      await loadThemeFonts(themeData, 250);
      updateTheme(themeData);
      setSessionHasTheme(true);
    }

    // Store the file handle for later saving (none on the fallback path, so
    // the previous notebook's file stops being the save target). Assigned
    // only now, after the waits, so saves during them still target the old
    // file.
    fileHandle = handle;

    // The notebook being replaced keeps its pending edits in its own session.
    flushAutosave();

    // Apply code visibility if document has settings
    if (documentVisibilityState) {
      restoreSessionState(documentVisibilityState);
    }

    // Load notebook directly into current session
    actions.loadNotebook(
      newCells,
      filename,
      history,
      history.length - 1,
      null,
      settings.executionMode || APP_DEFAULT_EXECUTION_MODE,
      settings.showTrailingAddButtons,
      settings.autorun,
      settings.codeHiddenPlaceholder,
      settings.autorunOnRefresh,
      loaded.metadata,
    );

    // Update URL without reload
    const url = new URL(window.location.href);
    url.searchParams.set("session", newSessionId);
    url.searchParams.delete("open");
    window.history.replaceState({}, "", url.toString());
    if (documentStored) documentDataHome = { sessionId: newSessionId, place: "indexeddb", data: documentData };
    setDocumentDataLost(false);

    // Persist the handle so saves keep targeting this file after reloads
    if (handle) void saveFileHandle(newSessionId, handle);

    // Trigger autosave to persist the new session
    autosaveNotebookImmediate();
  };

  // Open file using File System Access API (Chromium) or fallback to file input
  const handleOpenFile = async () => {
    // Check if File System Access API is available
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'Notebooks (.ipynb, .pynote)',
            accept: { 'application/x-ipynb+json': ['.ipynb'], 'text/x-pynote': ['.pynote'] }
          }],
          multiple: false
        });
        const file = await handle.getFile();
        await openPicked({ name: file.name, content: await file.text(), handle });
        return;
      } catch (err: any) {
        // User cancelled or API error - if cancelled, just return silently
        if (err.name === 'AbortError') return;
        console.warn("File System Access API failed, falling back to file input:", err);
      }
    }
    // Fallback: trigger the hidden file input
    fileInput?.click();
  };

  const handleLoad = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (fileInput) fileInput.value = "";
    if (!file) return;
    // No file handle on this path (fallback for browsers without the API).
    await openPicked({ name: file.name, content: await file.text(), handle: null });
  };

  return (
    <main class="pb-32">
       {/* Global Toolbar (slid out of view in presentation mode, and inert
           there so the keyboard cannot reach its hidden controls either) */}
       <div
         class={`sticky top-0 z-[200000] bg-background/80 backdrop-blur-md [border-bottom-width:var(--ui-divider-width,1px)] ui-divider mb-8 shadow-sm transition-transform duration-300 ${notebookStore.presentationMode ? "-translate-y-full" : ""}`}
         inert={notebookStore.presentationMode}
         onClick={(e) => {
           e.stopPropagation();
           // Deselect all cells when clicking the background
           if (!notebookStore.presentationMode) {
             actions.setActiveCell(null);
           }
         }}
       >
         <div class="px-7.5 max-xs:pl-6.5 max-xs:pr-2 py-4 flex items-center justify-between" 
              style={{ "max-width": "var(--page-max-width-header)", "margin-left": "var(--page-margin-x-header)", "margin-right": "var(--page-margin-x-header)" }} 
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}>
           <div class="flex items-center gap-2">
             <div class="btn-toolbar bg-primary! text-background! hover:bg-primary/90! flex items-center justify-center font-bold! text-xl! leading-none sm:flex border-primary">PyNote</div>
             <div class="h-8 w-px bg-foreground mx-1 hidden xs:block"></div>
             
             {/* Desktop Menu - Hidden on small screens */}
             <div class="hidden min-[800px]:flex items-center gap-2">
               {/* Options Menu */}
               <Dropdown trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Options <ChevronDown size={18} />
                   </button>
               }>
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">File</div>
                   <Show when={hostProfile.newNotebook}>
                     <DropdownItem onClick={() => { 
                         const url = sessionManager.createNewSessionUrl();
                         window.open(url, '_blank');
                     }} shortcut="Alt+N"> 
                         <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                     </DropdownItem>
                   </Show>
                   <Show when={hostProfile.openFiles}>
                     <DropdownItem onClick={handleOpenFile} shortcut="Ctrl+O">
                         <div class="flex items-center gap-2"><FolderOpen size={18} /> Open</div>
                     </DropdownItem>
                   </Show>
                   <DropdownItem onClick={handleSave} shortcut="Ctrl+S">
                       <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                   </DropdownItem>
                   <DropdownItem onClick={handleSaveAs} shortcut="Ctrl+Shift+S">
                       <div class="flex items-center gap-2"><Save size={18} /> Save As</div>
                   </DropdownItem>
                   <Show when={hostProfile.exportDialog}>
                     <DropdownItem onClick={() => setShowExportDialog(true)} shortcut="Ctrl+E">
                         <div class="flex items-center gap-2"><Download size={18} /> Export</div>
                     </DropdownItem>
                   </Show>
                   <Show when={hostProfile.embedded}>
                     <DropdownItem onClick={resetEmbeddedNotebook}>
                         <div class="flex items-center gap-2"><RotateCcw size={18} /> Reset Notebook</div>
                     </DropdownItem>
                   </Show>
                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Configuration</div>
                   <DropdownItem onClick={() => setShowThemeDialog(true)} shortcut="Alt+T">
                       <div class="flex items-center gap-2"><Palette size={18} /> Theme</div>
                   </DropdownItem>
                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">View</div>
                   <DropdownItem onClick={() => actions.setPresentationMode(true)} shortcut="Alt+P">
                       <div class="flex items-center gap-2"><Eye size={18} /> Presentation</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => setShowCodeVisibility(true)} shortcut="Alt+V">
                       <div class="flex items-center gap-2"><EyeOff size={18} /> Code</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => setShowPerformance(true)}>
                       <div class="flex items-center gap-2"><Activity size={18} /> Performance</div>
                   </DropdownItem>
                   <DropdownItem onClick={() => {
                       // Open tutorial in new tab. Resolved against the current URL:
                       // location.origin is "null" on file:// pages in some browsers.
                       const url = new URL(window.location.href);
                       url.search = "?open=tutorial";
                       window.open(url.toString(), '_blank');
                   }}>
                       <div class="flex items-center gap-2"><BookOpen size={18} /> Tutorial</div>
                   </DropdownItem>
                       <DropdownItem onClick={() => setShowLeftPanel(!showLeftPanel())} shortcut="Ctrl+.">
                         <div class="flex items-center gap-2"><PanelLeft size={18} /> Files & Data</div>
                     </DropdownItem>
                   <DropdownItem onClick={() => setShowShortcuts(!showShortcuts())} shortcut="Ctrl+\">
                       <div class="flex items-center gap-2"><Keyboard size={18} /> Shortcuts</div>
                   </DropdownItem>
               </Dropdown>
    
               {/* Kernel Menu */}
               <Dropdown trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Kernel <ChevronDown size={18} />
                   </button>
               }>
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Cell</div>
                   <DropdownItem 
                        onClick={runSelected}
                        disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                        shortcut="Shift+Enter"
                   >
                       <div class="flex items-center gap-2"><Play size={18} /> Run Selected</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={clearSelectedOutput}
                        disabled={kernel.status !== "ready" || !notebookStore.activeCellId || (() => {
                            const c = notebookStore.cells.find(c => c.id === notebookStore.activeCellId);
                            return !c || !c.outputs;
                        })()}
                        shortcut="Ctrl+Backspace"
                   >
                       <div class="flex items-center gap-2"><X size={18} /> Clear Output</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={deleteSelected}
                        disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                        shortcut="Ctrl+Delete"
                   >
                       <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete Cell</div>
                   </DropdownItem>

                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Notebook</div>
                   
                   <DropdownItem 
                        onClick={runAll} 
                        disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                        shortcut="Alt+R"
                   >
                       <div class="flex items-center gap-2"><Play size={18} /> Run All</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={() => actions.clearAllOutputs()}
                        disabled={kernel.status !== "ready" || !notebookStore.cells.some(c => c.outputs)}
                        shortcut="Alt+Backspace"
                   >
                       <div class="flex items-center gap-2"><X size={18} /> Clear All Outputs</div>
                   </DropdownItem>
                   <DropdownItem 
                        onClick={handleDeleteAllCells}
                        disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                        shortcut="Alt+Delete"
                   >
                       <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete All Cells</div>
                   </DropdownItem>

                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Execution</div>
                   
                   <DropdownItem onClick={() => actions.setExecutionMode("queue_all")}>
                       <div class="flex items-center gap-2">
                           <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "queue_all" ? "bg-accent" : ""}`}></div>
                           Sequential
                       </div>
                   </DropdownItem>
                   <DropdownItem onClick={() => actions.setExecutionMode("hybrid")}>
                       <div class="flex items-center gap-2">
                           <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "hybrid" ? "bg-accent" : ""}`}></div>
                           Hybrid
                       </div>
                   </DropdownItem>
                   <DropdownItem onClick={() => actions.setExecutionMode("direct")}>
                       <div class="flex items-center gap-2">
                           <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "direct" ? "bg-accent" : ""}`}></div>
                           Concurrent
                       </div>
                   </DropdownItem>
                   <DropdownItem onClick={() => actions.setExecutionMode("reactive")}>
                       <div class="flex items-center gap-2">
                           <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "reactive" ? "bg-accent" : ""}`}></div>
                           Reactive
                       </div>
                   </DropdownItem>

                   <DropdownDivider />
                   <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Session</div>
                   
                   <DropdownItem onClick={actions.restartKernel} shortcut="Alt+K">
                       <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                   </DropdownItem>
                   <DropdownItem onClick={actions.shutDownKernel} shortcut="Alt+Q">
                       <div class="flex items-center gap-2 text-primary"><StopCircle size={18} /> Shut Down</div>
                   </DropdownItem>
               </Dropdown>
               
               <div class="h-8 w-px bg-foreground mx-1"></div>
    
               <button onClick={(e) => {
                 const idx = (() => {
                   const activeId = notebookStore.activeCellId;
                   if (!activeId) return e.shiftKey ? 0 : undefined;
                   const i = notebookStore.cells.findIndex(c => c.id === activeId);
                   if (i === -1) return e.shiftKey ? 0 : undefined;
                   return e.shiftKey ? i : i + 1;
                 })();
                 actions.addCell("code", idx);
               }} class="btn-toolbar flex items-center gap-1" title="Add Code Cell" data-testid={TESTID.addCodeCell}>
                 <Plus size={20} /> <Code size={20} />
               </button>
               <button onClick={(e) => {
                 const idx = (() => {
                   const activeId = notebookStore.activeCellId;
                   if (!activeId) return e.shiftKey ? 0 : undefined;
                   const i = notebookStore.cells.findIndex(c => c.id === activeId);
                   if (i === -1) return e.shiftKey ? 0 : undefined;
                   return e.shiftKey ? i : i + 1;
                 })();
                 actions.addCell("markdown", idx);
               }} class="btn-toolbar flex items-center gap-1" title="Add Markdown Cell" data-testid={TESTID.addMarkdownCell}>
                 <Plus size={20} /> <FileText size={20} />
               </button>
               
               <div class="h-8 w-px bg-foreground mx-1"></div>
  
               {/* Undo/Redo */}
               <button 
                 onClick={handleUndo} 
                 class="btn-toolbar flex items-center gap-1" 
                 title="Undo"
                 disabled={getUndoDisabled()}
                 classList={{ "opacity-50 cursor-not-allowed": getUndoDisabled() }}
               >
                 <Undo2 size={20} />
               </button>
               <button 
                 onClick={handleRedo} 
                 class="btn-toolbar flex items-center gap-1" 
                 title="Redo"
                 disabled={getRedoDisabled()}
                 classList={{ "opacity-50 cursor-not-allowed": getRedoDisabled() }}
               >
                 <Redo2 size={20} />
               </button>
             </div>

             {/* Mobile Menu - Shown on small screens */}
             <div class="flex min-[800px]:hidden items-center gap-2">
               {/* Options Dropdown (File + Kernel) */}
               <Dropdown 
                 trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Options <ChevronDown size={18} />
                   </button>
                 }
                 fullWidthMobile={true}
               >
                     {/* File Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">File</div>
                     <Show when={hostProfile.newNotebook}>
                       <DropdownItem onClick={() => {
                          const url = sessionManager.createNewSessionUrl();
                          window.open(url, '_blank');
                       }} shortcut="Alt+N">
                           <div class="flex items-center gap-2"><FileText size={18} /> New Notebook</div>
                       </DropdownItem>
                     </Show>
                     <Show when={hostProfile.openFiles}>
                       <DropdownItem onClick={handleOpenFile} shortcut="Ctrl+O">
                           <div class="flex items-center gap-2"><FolderOpen size={18} /> Open</div>
                       </DropdownItem>
                     </Show>
                     <DropdownItem onClick={handleSave} shortcut="Ctrl+S">
                         <div class="flex items-center gap-2"><Save size={18} /> Save</div>
                     </DropdownItem>
                     <DropdownItem onClick={handleSaveAs} shortcut="Ctrl+Shift+S">
                         <div class="flex items-center gap-2"><Save size={18} /> Save As</div>
                     </DropdownItem>
                     <Show when={hostProfile.exportDialog}>
                       <DropdownItem onClick={() => setShowExportDialog(true)} shortcut="Ctrl+E">
                           <div class="flex items-center gap-2"><Download size={18} /> Export</div>
                       </DropdownItem>
                     </Show>
                     <Show when={hostProfile.embedded}>
                       <DropdownItem onClick={resetEmbeddedNotebook}>
                           <div class="flex items-center gap-2"><RotateCcw size={18} /> Reset Notebook</div>
                       </DropdownItem>
                     </Show>
                     
                     <DropdownDivider />
                     {/* Configuration Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Configuration</div>
                     <DropdownItem onClick={() => setShowThemeDialog(true)} shortcut="Alt+T">
                         <div class="flex items-center gap-2"><Palette size={18} /> Theme</div>
                     </DropdownItem>
                     
                     <DropdownDivider />
                     {/* Execution Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Execution</div>
                     <DropdownItem onClick={() => actions.setExecutionMode("queue_all")}>
                         <div class="flex items-center gap-2">
                             <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "queue_all" ? "bg-accent" : ""}`}></div>
                             Sequential
                         </div>
                     </DropdownItem>
                     <DropdownItem onClick={() => actions.setExecutionMode("hybrid")}>
                         <div class="flex items-center gap-2">
                             <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "hybrid" ? "bg-accent" : ""}`}></div>
                             Hybrid
                         </div>
                     </DropdownItem>
                     <DropdownItem onClick={() => actions.setExecutionMode("direct")}>
                         <div class="flex items-center gap-2">
                             <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "direct" ? "bg-accent" : ""}`}></div>
                             Concurrent
                         </div>
                     </DropdownItem>
                     <DropdownItem onClick={() => actions.setExecutionMode("reactive")}>
                         <div class="flex items-center gap-2">
                             <div class={`w-4 h-4 rounded-full border border-current ${notebookStore.executionMode === "reactive" ? "bg-accent" : ""}`}></div>
                             Reactive
                         </div>
                     </DropdownItem>
                     
                     <DropdownDivider />
                     {/* View Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">View</div>
                     <DropdownItem onClick={() => actions.setPresentationMode(true)} shortcut="Alt+P">
                       <div class="flex items-center gap-2"><Eye size={18} /> Presentation</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => setShowCodeVisibility(true)} shortcut="Alt+V">
                         <div class="flex items-center gap-2"><EyeOff size={18} /> Code</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => setShowPerformance(true)}>
                         <div class="flex items-center gap-2"><Activity size={18} /> Performance</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => {
                         // Open tutorial in new tab (resolved against the current URL,
                         // see the desktop menu).
                         const url = new URL(window.location.href);
                         url.search = "?open=tutorial";
                         window.open(url.toString(), '_blank');
                     }}>
                         <div class="flex items-center gap-2"><BookOpen size={18} /> Tutorial</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => setShowLeftPanel(true)} shortcut="Ctrl+.">
                       <div class="flex items-center gap-2"><PanelLeft size={18} /> Files & Data</div>
                     </DropdownItem>
                     <DropdownItem onClick={() => setShowShortcuts(true)} shortcut="Ctrl+\">
                         <div class="flex items-center gap-2"><Keyboard size={18} /> Shortcuts</div>
                     </DropdownItem>
               </Dropdown>

               {/* Actions Dropdown (Add + Undo/Redo) */}
               <Dropdown 
                 trigger={
                   <button class="btn-toolbar flex items-center gap-1">
                       Actions <ChevronDown size={18} />
                   </button>
                 }
                 fullWidthMobile={true}
               >
                     {/* Undo/Redo at top */}
                     <DropdownItem 
                       onClick={handleUndo}
                       disabled={getUndoDisabled()}
                     >
                         <div class="flex items-center gap-2"><Undo2 size={16} /> Undo</div>
                     </DropdownItem>
                     <DropdownItem 
                       onClick={handleRedo}
                       disabled={getRedoDisabled()}
                     >
                         <div class="flex items-center gap-2"><Redo2 size={16} /> Redo</div>
                     </DropdownItem>
                     
                     <DropdownDivider />
                     
                     {/* Add Cells */}
                     <DropdownItem onClick={(e) => {
                       const idx = (() => {
                         const activeId = notebookStore.activeCellId;
                         if (!activeId) return e.shiftKey ? 0 : undefined;
                         const i = notebookStore.cells.findIndex(c => c.id === activeId);
                         if (i === -1) return e.shiftKey ? 0 : undefined;
                         return e.shiftKey ? i : i + 1;
                       })();
                       actions.addCell("code", idx);
                     }}>
                         <div class="flex items-center gap-2"><Code size={18} /> Add Code Cell</div>
                     </DropdownItem>
                     <DropdownItem onClick={(e) => {
                       const idx = (() => {
                         const activeId = notebookStore.activeCellId;
                         if (!activeId) return e.shiftKey ? 0 : undefined;
                         const i = notebookStore.cells.findIndex(c => c.id === activeId);
                         if (i === -1) return e.shiftKey ? 0 : undefined;
                         return e.shiftKey ? i : i + 1;
                       })();
                       actions.addCell("markdown", idx);
                     }}>
                         <div class="flex items-center gap-2"><FileText size={18} /> Add Markdown Cell</div>
                     </DropdownItem>
                     
                     <DropdownDivider />
                     
                     {/* Kernel Section */}
                     <div class="px-4 py-2 text-xs font-bold text-secondary/70 uppercase">Kernel</div>
                     <DropdownItem 
                          onClick={runSelected}
                          disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                          shortcut="Shift+Enter"
                     >
                         <div class="flex items-center gap-2"><Play size={18} /> Run Selected</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={clearSelectedOutput}
                          disabled={kernel.status !== "ready" || !notebookStore.activeCellId || (() => {
                              const c = notebookStore.cells.find(c => c.id === notebookStore.activeCellId);
                              return !c || !c.outputs;
                          })()}
                          shortcut="Ctrl+Backspace"
                     >
                         <div class="flex items-center gap-2"><X size={18} /> Clear Output</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={deleteSelected}
                          disabled={kernel.status !== "ready" || !notebookStore.activeCellId}
                          shortcut="Ctrl+Delete"
                     >
                         <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete Cell</div>
                     </DropdownItem>

                     <DropdownDivider />
                     
                     <DropdownItem 
                          onClick={runAll} 
                          disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                          shortcut="Alt+R"
                     >
                         <div class="flex items-center gap-2"><Play size={18} /> Run All</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={() => actions.clearAllOutputs()}
                          disabled={kernel.status !== "ready" || !notebookStore.cells.some(c => c.outputs)}
                          shortcut="Alt+Backspace"
                     >
                         <div class="flex items-center gap-2"><X size={18} /> Clear All Outputs</div>
                     </DropdownItem>
                     <DropdownItem 
                          onClick={handleDeleteAllCells}
                          disabled={kernel.status !== "ready" || notebookStore.cells.length === 0}
                          shortcut="Alt+Delete"
                     >
                         <div class="flex items-center gap-2 text-primary"><Trash2 size={18} /> Delete All Cells</div>
                     </DropdownItem>

                     <DropdownDivider />
                     
                     <DropdownItem onClick={actions.restartKernel} shortcut="Alt+K">
                         <div class="flex items-center gap-2 text-accent"><RotateCw size={18} /> Restart</div>
                     </DropdownItem>
                     <DropdownItem onClick={actions.shutDownKernel} shortcut="Alt+Q">
                         <div class="flex items-center gap-2 text-primary"><StopCircle size={18} /> Shut Down</div>
                     </DropdownItem>
               </Dropdown>
             </div>
             
             <input ref={fileInput} type="file" accept={OPEN_ACCEPT} class="hidden" onChange={handleLoad} />
           </div>
  
           <div class="flex items-center gap-2 max-xs:flex-1 max-xs:justify-center">
             <Show when={autosaveFailed()}>
               <div
                 data-testid={TESTID.autosaveWarning}
                 role="status"
                 title="The browser could not store this notebook (its storage is full or unavailable), so reloading or closing this tab would lose your latest changes. Save the notebook to a file to keep them."
                 class="text-xs font-mono py-1 rounded-sm flex items-center gap-1 text-error"
               >
                 <TriangleAlert size={14} />
                 <span class="hidden sm:inline">NOT AUTOSAVED</span>
               </div>
             </Show>
             <Show when={documentDataLost()}>
               <div
                 data-testid={TESTID.documentDataLost}
                 role="status"
                 title="The browser no longer has the attachments and metadata this notebook was opened with (such as images pasted into its markdown and other tools' settings), so they are missing here. Save does not overwrite the opened file, which still has them."
                 class="text-xs font-mono py-1 rounded-sm flex items-center gap-1 text-warning"
               >
                 <TriangleAlert size={14} />
                 <span class="hidden sm:inline">ATTACHMENTS LOST</span>
               </div>
             </Show>
             <div
               data-testid={TESTID.kernelStatus}
               data-status={kernel.status}
               class={`text-xs font-mono py-1 rounded-sm flex items-center gap-2 ${
                 kernel.status === "ready" ? "text-success" :
                 (kernel.status === "loading" || kernel.status === "running") ? "text-warning" :
                 "text-error"
             }`}>
               <div class={`w-2 h-2 rounded-full bg-current max-xs:-mr-1.5 ${ 
                   kernel.status === "running" || kernel.status === "loading" ? "animate-pulse" : "" 
               }`}></div>
               <span class="hidden sm:inline">{kernel.status.toUpperCase()}</span>
             </div>
           </div>
         </div>
       </div>

       <div style={{ "max-width": "var(--page-max-width-content)", "margin-left": "var(--page-margin-x-content)", "margin-right": "var(--page-margin-x-content)" }}>
         {/* Cells List */}
         <DragDropProvider onDragStart={onDragStart} onDragEnd={onDragEnd} collisionDetector={closestCorners}>
           <DragOffsetTracker setGrabOffsetX={setGrabOffsetX} />
           <AutoScroller />
           <Show when={APP_ENABLE_CELL_DND}><DragDropSensors /></Show>
           <div class="px-4 max-xs:px-3">
             <For each={[notebookVersion()]}>
               {() => (
                 <SortableProvider ids={notebookStore.cells.map((c) => c.id)}>
                   <TransitionGroup name="cell-list">
                     <For each={notebookStore.cells}>
                       {(cell, index) => {
                         const prevCellId = () => index() > 0 ? notebookStore.cells[index() - 1].id : null;
                         return (
                           <Switch fallback={<MarkdownCell cell={cell} isActive={notebookStore.activeCellId === cell.id} index={index()} prevCellId={prevCellId()} />}>
                             <Match when={cell.type === "code"}>
                               <CodeCell 
                                   cell={cell} 
                                   isActive={notebookStore.activeCellId === cell.id} 
                                   index={index()} 
                                   prevCellId={prevCellId()} 
                                   runCell={runCell} 
                                   // Pass checker ONLY if Reactive. This ensures undefined is passed otherwise.
                                   checkRedefinitions={
                                     notebookStore.executionMode === "reactive" 
                                       ? getRedefinitionChecker(cell.id) 
                                       : undefined
                                   }
                               />
                             </Match>
                             <Match when={cell.type === "raw"}>
                               <RawCell cell={cell} isActive={notebookStore.activeCellId === cell.id} index={index()} prevCellId={prevCellId()} />
                             </Match>
                           </Switch>
                         );
                       }}
                     </For>
                   </TransitionGroup>
                 </SortableProvider>
               )}
             </For>
           </div>
           {/* Invisible DragOverlay for collision detection only */}
           <DragOverlay style={{ opacity: 0, "pointer-events": "none" }}>
             <Show when={draggedHeight()}>
               <div style={{ height: `${draggedHeight()}px`, width: "100%" }} />
             </Show>
           </DragOverlay>
           {/* Custom visual overlay that follows cursor */}
           <CustomDragOverlay height={draggedHeight()} grabOffsetX={grabOffsetX()} cellWidth={cellWidth()} />
         </DragDropProvider>
         
         {/* Bottom Add Buttons - Hidden in presentation mode or by config */}
         <Show when={!notebookStore.presentationMode && notebookStore.showTrailingAddButtons}>
           <div 
             class="flex justify-center gap-2 mt-8"
             onMouseDown={(e) => e.stopPropagation()}
             onClick={(e) => e.stopPropagation()}
           >
             <button
               onClick={() => actions.addCell("code")}
               class="btn-toolbar flex items-center gap-2 text-foreground! border-transparent! hover:bg-transparent! hover:text-accent/70! focus:bg-transparent! focus:text-accent!"
               title="Add Code Cell"
             >
                <Plus size={20} />
                <span class="text-sm font-bold">Code</span>
             </button>
             <button
               onClick={() => actions.addCell("markdown")}
               class="btn-toolbar flex items-center gap-2 text-foreground! border-transparent! hover:bg-transparent! hover:text-accent/70! focus:bg-transparent! focus:text-accent!"
               title="Add Markdown Cell"
             >
                <Plus size={20} />
                <span class="text-sm font-bold">Text</span>
             </button>
           </div>
         </Show>
       </div>

       {/* Presentation Mode Exit Controls (a read-only export stays in presentation) */}
       <Show when={notebookStore.presentationMode && !readOnly}>
         {/* Exit button - top right */}
         <button 
           onClick={() => actions.setPresentationMode(false)}
           class="fixed top-4 right-4 z-50 p-2 bg-background/80 backdrop-blur-md ui-border rounded-sm hover:bg-foreground transition-colors shadow-lg"
           title="Exit Presentation Mode"
         >
           <X size={20} class="text-secondary" />
         </button>
         
         {/* Hint message - bottom right */}
         <Show when={showEscHint()}>
           <div class="fixed bottom-4 right-4 z-50 px-4 py-2 bg-background/60 backdrop-blur-md border border-foreground/30 rounded-sm text-sm text-secondary/60 shadow-lg">
             Press Esc to exit
           </div>
         </Show>
       </Show>

       {/* Keyboard Shortcuts Modal */}
       <Show when={showShortcuts()}>
         <div class="fixed inset-0 z-[300000] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm 2xl:hidden" onClick={() => setShowShortcuts(false)}>
           <div class="bg-background ui-border ui-font rounded-sm shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
             <div class="flex items-center justify-between p-4 [border-bottom-width:var(--ui-divider-width,1px)] ui-divider shrink-0">
               <h2 class="text-lg font-bold flex items-center gap-2"><Keyboard /> Keyboard Shortcuts</h2>
               <button onClick={() => setShowShortcuts(false)} class="p-1 hover:bg-foreground rounded-sm">
                 <X size={20} />
               </button>
             </div>
             <div class="p-4 space-y-6 overflow-y-auto flex-1">
               
               <div>
                 <h3 class="text-sm font-bold text-accent uppercase mb-2">Global</h3>
                 <div class="grid grid-cols-2 gap-2 text-sm">
                   <For each={SHORTCUTS.global}>
                       {s => <><div class="text-secondary/80">{s.label}</div><div class="font-mono text-right">{s.keys}</div></>}
                   </For>
                 </div>
               </div>

               <div>
                 <h3 class="text-sm font-bold text-accent uppercase mb-2">Command Mode (Cell Selected)</h3>
                 <div class="grid grid-cols-2 gap-2 text-sm">
                   <For each={SHORTCUTS.command}>
                       {s => <><div class="text-secondary/80">{s.label}</div><div class="font-mono text-right">{s.keys}</div></>}
                   </For>
                 </div>
               </div>

               <div>
                 <h3 class="text-sm font-bold text-accent uppercase mb-2">Edit Mode</h3>
                 <div class="grid grid-cols-2 gap-2 text-sm">
                    <For each={SHORTCUTS.edit}>
                       {s => <><div class="text-secondary/80">{s.label}</div><div class="font-mono text-right">{s.keys}</div></>}
                   </For>
                 </div>
               </div>

             </div>
             <div class="p-4 [border-top-width:var(--ui-divider-width,1px)] ui-divider text-center text-xs text-secondary/50 shrink-0">
               Click anywhere outside to close
             </div>
           </div>
         </div>
       </Show>

       {/* Side Shortcuts (Visible on 2xl screens) */}
       <Show when={showShortcuts() && !notebookStore.presentationMode}>
          <SideShortcuts 
            activeId={notebookStore.activeCellId} 
            isEditing={!!notebookStore.activeCellId && !!notebookStore.cells.find(c => c.id === notebookStore.activeCellId)?.isEditing} 
            onClose={() => setShowShortcuts(false)}
          />
       </Show>

       {/* Left Panel Modal */}
       <Show when={showLeftPanel() && !isWideFilesViewport()}>
         <div class="fixed inset-0 z-300000 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm 2xl:hidden" onClick={() => setShowLeftPanel(false)} data-testid={TESTID.filesDialog}>
           <div class="bg-background ui-border ui-font rounded-sm shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
             <div class="flex items-center justify-between p-4 [border-bottom-width:var(--ui-divider-width,1px)] ui-divider shrink-0">
               <h2 class="text-lg font-bold flex items-center gap-2"><PanelLeft /> Files & Data</h2>
               <button onClick={() => setShowLeftPanel(false)} class="p-1 hover:bg-foreground rounded-sm">
                 <X size={20} />
               </button>
             </div>
             <div class="p-4 overflow-y-auto flex-1">
               <FileWorkspacePanel
                 mode="dialog"
                 viewMode={filesPanelViewMode()}
                 onViewModeChange={setAndPersistFilesPanelViewMode}
               />
             </div>
             <div class="p-4 [border-top-width:var(--ui-divider-width,1px)] ui-divider text-center text-xs text-secondary/50 shrink-0">
               Click anywhere outside to close
             </div>
           </div>
         </div>
       </Show>

       {/* Left Panel (Visible on 2xl screens) */}
       <Show when={showLeftPanel() && !notebookStore.presentationMode && isWideFilesViewport()}>
        <SideLeftPanel
          onClose={() => setShowLeftPanel(false)}
          viewMode={filesPanelViewMode()}
          onViewModeChange={setAndPersistFilesPanelViewMode}
        />
       </Show>

       {/* Performance Monitor */}
       <Show when={showPerformance()}>
          <PerformanceMonitor onClose={() => setShowPerformance(false)} />
       </Show>

       {/* Code Visibility Dialog */}
       <Show when={showCodeVisibility()}>
          <CodeVisibilityDialog 
            onClose={() => setShowCodeVisibility(false)} 
            activeCellId={notebookStore.activeCellId}
            onSave={() => {
              // Autosave after visibility settings change
              autosaveNotebookImmediate();
            }}
          />
       </Show>

       {/* Export Dialog */}
       <Show when={showExportDialog()}>
          <ExportDialog onClose={() => setShowExportDialog(false)} />
       </Show>

       {/* Theme Dialog */}
       <Show when={showThemeDialog()}>
          <ThemeDialog 
            onClose={() => setShowThemeDialog(false)}
            initialScope="session-only"
            onSave={(applyToSession) => {
              if (applyToSession) {
                // Session-only: just autosave (theme already in currentTheme, will be saved with session)
                setSessionHasTheme(true);
                autosaveNotebookImmediate(); // Immediate save for explicit user action
              } else {
                // App-wide: save to localStorage, remove from session
                saveThemeAppWide();
                setSessionHasTheme(false);
                autosaveNotebookImmediate(); // Immediate save for explicit user action
                // Reload page to ensure browser caches the new theme colors
                window.location.reload();
              }
            }}
          />
       </Show>

       {/* Mobile Cell Action Drawer for narrow screens only (`lg:hidden`), where the
           per-cell side toolbar can't be shown. Rendered once and portaled to
           <body> so it sits at the bottom of the viewport. The outer Transition
           slides it in/out only when going between an active cell and none; the
           inner Transition (mode="outin") cross-fades the controls when switching
           from one cell to another. */}
       <Portal>
         <div class="fixed inset-x-0 bottom-0 translate-y-[3rem] z-[199999] lg:hidden pointer-events-none">
           <Transition name="cell-drawer">
             <Show when={drawerOpen()}>
               <div
                 class="cell-drawer-panel pointer-events-auto bg-primary ui-font rounded-t-[var(--radius-sm)] shadow-[0_-2px_10px_-3px_rgba(0,0,0,0.7)]"
                 onMouseDown={(e) => e.stopPropagation()}
                 onClick={(e) => e.stopPropagation()}
               >
                 <Transition name="cell-drawer-fade">
                   <Show when={drawerContentCell()} keyed>
                     {(cell) => <CellDrawerToolbar cell={cell} runCell={runCell} />}
                   </Show>
                 </Transition>
               </div>
             </Show>
           </Transition>
         </div>
       </Portal>
    </main>
  );
};

export default Notebook;