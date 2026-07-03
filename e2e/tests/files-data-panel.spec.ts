import { test, expect } from "../support/fixtures";
import { TESTID } from "../support/selectors";
import type { Page, Dialog } from "@playwright/test";
import type { NotebookPage } from "../pages/NotebookPage";

type PanelMode = "side" | "dialog";

const makeRunId = (): string => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

const setupViewportAndOpen = async (
  mode: PanelMode,
  page: Page,
  notebook: NotebookPage,
): Promise<void> => {
  if (mode === "side") {
    await page.setViewportSize({ width: 1700, height: 1100 });
  } else {
    await page.setViewportSize({ width: 1280, height: 900 });
  }

  await notebook.open();
};

const runCellAndExpect = async (
  page: Page,
  notebook: NotebookPage,
  code: string,
  marker: string,
): Promise<void> => {
  if (await notebook.filesDialog.isVisible()) {
    await page.keyboard.press("Control+.");
    if (await notebook.filesDialog.isVisible()) {
      await notebook.filesDialog.click({ position: { x: 8, y: 8 } });
    }
    await expect(notebook.filesDialog).toBeHidden();
  }
  await notebook.waitForKernelReady();
  await notebook.addAndRunCodeCell(code);
  await notebook.expectAnyOutputToContain(marker);
};

const cleanupRoot = async (
  page: Page,
  notebook: NotebookPage,
  rootName: string,
): Promise<void> => {
  if (page.isClosed()) return;

  try {
    await runCellAndExpect(
      page,
      notebook,
      [
        "import shutil",
        "from pathlib import Path",
        `root = Path('/workspace') / '${rootName}'`,
        "if root.exists():",
        "    shutil.rmtree(root)",
        "print('CLEANUP_OK')",
      ].join("\n"),
      "CLEANUP_OK",
    );
  } catch {
    // Cleanup should never hide the original test failure signal.
  }
};

test.describe("files and data panel", () => {
  test("Upload component with dir writes to workspace and appears in Files & Data", async ({ notebook, page }) => {
    const rootName = `e2e-upload-dir-${makeRunId()}`;
    const uploadLabel = `Upload target ${rootName}`;
    const fileName = "payload.csv";
    const fileContents = "alpha,beta\n1,2\n";

    try {
      await setupViewportAndOpen("dialog", page, notebook);

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          "from pynote_ui import Group, Text, Upload, display",
          `root = Path('/workspace') / '${rootName}'`,
          "root.mkdir(parents=True, exist_ok=True)",
          `uploader = Upload(label='${uploadLabel}', dir='${rootName}')`,
          "display(Group([",
          "    Text(content='Upload fixture', border=False),",
          "    uploader,",
          `], label='${uploadLabel}', border=True))`,
          "print('UPLOAD_WIDGET_READY')",
        ].join("\n"),
        "UPLOAD_WIDGET_READY",
      );

      await notebook.uploadFileViaComponent(uploadLabel, {
        name: fileName,
        mimeType: "text/csv",
        buffer: Buffer.from(fileContents, "utf-8"),
      });

      await expect(notebook.uploadComponent(uploadLabel)).toContainText(fileName, { timeout: 60_000 });

      await notebook.openFilesData("dialog");
      await notebook.refreshFilesData("dialog");
      await notebook.filesRow("dialog", rootName).dblclick();
      await expect(notebook.filesRow("dialog", fileName)).toBeVisible();

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          `file_path = root / '${fileName}'`,
          "ok = file_path.exists() and file_path.read_text(encoding='utf-8') == 'alpha,beta\\n1,2\\n'",
          "print('VERIFY_OK_UPLOAD_DIR' if ok else 'VERIFY_FAIL_UPLOAD_DIR')",
        ].join("\n"),
        "VERIFY_OK_UPLOAD_DIR",
      );
    } finally {
      await cleanupRoot(page, notebook, rootName);
    }
  });

  test("dialog mode roundtrip: create in code cell, move in panel, verify in code cell", async ({ notebook, page }) => {
    const rootName = `e2e-fs-dialog-${makeRunId()}`;

    try {
      await setupViewportAndOpen("dialog", page, notebook);

      await runCellAndExpect(
        page,
        notebook,
        [
          "import shutil",
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "if root.exists():",
          "    shutil.rmtree(root)",
          "(root / 'archive').mkdir(parents=True)",
          "(root / 'input.csv').write_text('from-input', encoding='utf-8')",
          "print('SETUP_OK_DIALOG')",
        ].join("\n"),
        "SETUP_OK_DIALOG",
      );

      await notebook.openFilesData("dialog");
      await notebook.filesRow("dialog", rootName).dblclick();
      await notebook.dragFileRowTo("dialog", "input.csv", "archive");
      await expect(notebook.filesRow("dialog", "input.csv")).toHaveCount(0);

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "ok = (root / 'archive' / 'input.csv').exists() and not (root / 'input.csv').exists()",
          "print('VERIFY_OK_DIALOG' if ok else 'VERIFY_FAIL_DIALOG')",
        ].join("\n"),
        "VERIFY_OK_DIALOG",
      );
    } finally {
      await cleanupRoot(page, notebook, rootName);
    }
  });

  test("side mode roundtrip: create in code cell, move in panel, verify in code cell", async ({ notebook, page }) => {
    const rootName = `e2e-fs-side-${makeRunId()}`;

    try {
      await setupViewportAndOpen("side", page, notebook);

      await runCellAndExpect(
        page,
        notebook,
        [
          "import shutil",
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "if root.exists():",
          "    shutil.rmtree(root)",
          "(root / 'archive').mkdir(parents=True)",
          "(root / 'input.csv').write_text('from-input', encoding='utf-8')",
          "print('SETUP_OK_SIDE')",
        ].join("\n"),
        "SETUP_OK_SIDE",
      );

      await notebook.openFilesData("side");
      await notebook.filesRow("side", rootName).dblclick();
      await notebook.dragFileRowTo("side", "input.csv", "archive");
      await expect(notebook.filesRow("side", "input.csv")).toHaveCount(0);

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "ok = (root / 'archive' / 'input.csv').exists() and not (root / 'input.csv').exists()",
          "print('VERIFY_OK_SIDE' if ok else 'VERIFY_FAIL_SIDE')",
        ].join("\n"),
        "VERIFY_OK_SIDE",
      );
    } finally {
      await cleanupRoot(page, notebook, rootName);
    }
  });

  test("same-directory drop is no-op and shows no error", async ({ notebook, page }) => {
    const rootName = `e2e-fs-noop-${makeRunId()}`;
    const rootPath = `/workspace/${rootName}`;

    try {
      await setupViewportAndOpen("dialog", page, notebook);

      await runCellAndExpect(
        page,
        notebook,
        [
          "import shutil",
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "if root.exists():",
          "    shutil.rmtree(root)",
          "root.mkdir(parents=True)",
          "(root / 'same.csv').write_text('same-dir', encoding='utf-8')",
          "print('SETUP_OK_NOOP')",
        ].join("\n"),
        "SETUP_OK_NOOP",
      );

      await notebook.openFilesData("dialog");
      await notebook.filesRow("dialog", rootName).dblclick();

      let promptCount = 0;
      const onDialog = async (dialog: Dialog) => {
        promptCount += 1;
        await dialog.accept("skip");
      };
      page.on("dialog", onDialog);

      try {
        await notebook.dragFileRowToBreadcrumb("dialog", "same.csv", rootPath);
        await expect(notebook.filesPanel("dialog").getByTestId(TESTID.filesPanelError)).toHaveCount(0);
      } finally {
        page.off("dialog", onDialog);
      }

      expect(promptCount).toBe(0);

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "ok = (root / 'same.csv').exists()",
          "print('VERIFY_OK_NOOP' if ok else 'VERIFY_FAIL_NOOP')",
        ].join("\n"),
        "VERIFY_OK_NOOP",
      );
    } finally {
      await cleanupRoot(page, notebook, rootName);
    }
  });

  test("name conflict prompt supports replace", async ({ notebook, page }) => {
    const rootName = `e2e-fs-replace-${makeRunId()}`;

    try {
      await setupViewportAndOpen("dialog", page, notebook);

      await runCellAndExpect(
        page,
        notebook,
        [
          "import shutil",
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "if root.exists():",
          "    shutil.rmtree(root)",
          "(root / 'dst').mkdir(parents=True)",
          "(root / 'sample.csv').write_text('src-v1', encoding='utf-8')",
          "(root / 'dst' / 'sample.csv').write_text('dst-old', encoding='utf-8')",
          "print('SETUP_OK_REPLACE')",
        ].join("\n"),
        "SETUP_OK_REPLACE",
      );

      await notebook.openFilesData("dialog");
      await notebook.filesRow("dialog", rootName).dblclick();

      page.once("dialog", async (dialog) => {
        await dialog.accept("replace");
      });
      await notebook.dragFileRowTo("dialog", "sample.csv", "dst");

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "dst_text = (root / 'dst' / 'sample.csv').read_text(encoding='utf-8')",
          "source_exists = (root / 'sample.csv').exists()",
          "ok = (dst_text == 'src-v1') and (not source_exists)",
          "print('VERIFY_OK_REPLACE' if ok else 'VERIFY_FAIL_REPLACE')",
        ].join("\n"),
        "VERIFY_OK_REPLACE",
      );
    } finally {
      await cleanupRoot(page, notebook, rootName);
    }
  });

  test("name conflict prompt supports copy", async ({ notebook, page }) => {
    const rootName = `e2e-fs-copy-${makeRunId()}`;

    try {
      await setupViewportAndOpen("dialog", page, notebook);

      await runCellAndExpect(
        page,
        notebook,
        [
          "import shutil",
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "if root.exists():",
          "    shutil.rmtree(root)",
          "(root / 'dst').mkdir(parents=True)",
          "(root / 'sample.csv').write_text('src-v1', encoding='utf-8')",
          "(root / 'dst' / 'sample.csv').write_text('dst-old', encoding='utf-8')",
          "print('SETUP_OK_COPY')",
        ].join("\n"),
        "SETUP_OK_COPY",
      );

      await notebook.openFilesData("dialog");
      await notebook.filesRow("dialog", rootName).dblclick();

      page.once("dialog", async (dialog) => {
        await dialog.accept("copy");
      });
      await notebook.dragFileRowTo("dialog", "sample.csv", "dst");

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "dst_original = (root / 'dst' / 'sample.csv').read_text(encoding='utf-8')",
          "dst_copy = (root / 'dst' / 'sample (copy).csv').read_text(encoding='utf-8')",
          "source_exists = (root / 'sample.csv').exists()",
          "ok = (dst_original == 'dst-old') and (dst_copy == 'src-v1') and (not source_exists)",
          "print('VERIFY_OK_COPY' if ok else 'VERIFY_FAIL_COPY')",
        ].join("\n"),
        "VERIFY_OK_COPY",
      );
    } finally {
      await cleanupRoot(page, notebook, rootName);
    }
  });

  test("name conflict prompt supports skip", async ({ notebook, page }) => {
    const rootName = `e2e-fs-skip-${makeRunId()}`;

    try {
      await setupViewportAndOpen("dialog", page, notebook);

      await runCellAndExpect(
        page,
        notebook,
        [
          "import shutil",
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "if root.exists():",
          "    shutil.rmtree(root)",
          "(root / 'dst').mkdir(parents=True)",
          "(root / 'sample.csv').write_text('src-v1', encoding='utf-8')",
          "(root / 'dst' / 'sample.csv').write_text('dst-old', encoding='utf-8')",
          "print('SETUP_OK_SKIP')",
        ].join("\n"),
        "SETUP_OK_SKIP",
      );

      await notebook.openFilesData("dialog");
      await notebook.filesRow("dialog", rootName).dblclick();

      page.once("dialog", async (dialog) => {
        await dialog.accept("skip");
      });
      await notebook.dragFileRowTo("dialog", "sample.csv", "dst");

      await runCellAndExpect(
        page,
        notebook,
        [
          "from pathlib import Path",
          `root = Path('/workspace') / '${rootName}'`,
          "dst_original = (root / 'dst' / 'sample.csv').read_text(encoding='utf-8')",
          "source_text = (root / 'sample.csv').read_text(encoding='utf-8')",
          "ok = (dst_original == 'dst-old') and (source_text == 'src-v1')",
          "print('VERIFY_OK_SKIP' if ok else 'VERIFY_FAIL_SKIP')",
        ].join("\n"),
        "VERIFY_OK_SKIP",
      );
    } finally {
      await cleanupRoot(page, notebook, rootName);
    }
  });
});
