import { zip } from "fflate";
import { isValidWindowsFileName } from "./clipboard-transfer";

const MAX_SOURCE_FILES = 65_535;
const MAX_SOURCE_INPUT_BYTES = 256 * 1024 * 1024;

const EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".github",
  ".hg",
  ".husky",
  ".idea",
  ".mypy_cache",
  ".next",
  ".nox",
  ".nuxt",
  ".parcel-cache",
  ".pytest_cache",
  ".ruff_cache",
  ".serverless",
  ".svn",
  ".tox",
  ".turbo",
  ".venv",
  ".vite",
  ".vscode",
  ".wrangler",
  "__pycache__",
  "build",
  "benchmark",
  "benchmarks",
  "coverage",
  "dist",
  "dist-ssr",
  "doc",
  "docs",
  "downloads",
  "e2e",
  "env",
  "example",
  "examples",
  "fixture",
  "fixtures",
  "htmlcov",
  "logs",
  "node_modules",
  "out",
  "playwright-report",
  "storybook-static",
  "target",
  "temp",
  "test",
  "test-results",
  "tests",
  "tmp",
  "venv",
  "vendor",
]);

const EXCLUDED_FILE_NAMES = new Set([
  ".coverage",
  ".ds_store",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "desktop.ini",
  "thumbs.db",
]);

const EXCLUDED_SUFFIXES = [
  ".7z",
  ".bak",
  ".class",
  ".db",
  ".dump",
  ".egg",
  ".gz",
  ".jks",
  ".key",
  ".keystore",
  ".log",
  ".map",
  ".min.css",
  ".min.js",
  ".p12",
  ".pem",
  ".pfx",
  ".pyc",
  ".pyo",
  ".rar",
  ".sqlite",
  ".sqlite3",
  ".swp",
  ".tar",
  ".tgz",
  ".tmp",
  ".zip",
];

const SOURCE_CODE_FILE_NAMES = new Set([
  ".dockerignore",
  ".editorconfig",
  ".eslintignore",
  ".gitignore",
  ".prettierignore",
  "pipfile",
  "dockerfile",
  "makefile",
]);

const PYTHON_PROJECT_MARKERS = new Set([
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "setup.cfg",
  "pipfile",
]);

const SOURCE_CODE_SUFFIXES = [
  ".bat",
  ".cfg",
  ".cmd",
  ".conf",
  ".css",
  ".gql",
  ".graphql",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".jsx",
  ".lock",
  ".mjs",
  ".properties",
  ".proto",
  ".ps1",
  ".py",
  ".pyi",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
];

export interface BrowserSourceFile {
  readonly name: string;
  readonly size: number;
  readonly webkitRelativePath: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface SourceArchive {
  readonly name: string;
  readonly rootName: string;
  readonly bytes: Uint8Array;
  readonly includedFileCount: number;
  readonly excludedFileCount: number;
  readonly inputBytes: number;
}

export interface PreparedSourceArchiveFile {
  readonly file: BrowserSourceFile;
  /** Complete path stored in the ZIP, including the selected root directory. */
  readonly path: string;
}

export interface PreparedSourceArchiveSelection {
  readonly rootName: string;
  readonly included: readonly PreparedSourceArchiveFile[];
  readonly excludedFileCount: number;
  readonly inputBytes: number;
}

export interface SourcePathDecision {
  readonly include: boolean;
  readonly relativePath: string;
  readonly rootName: string;
}

export interface SourceArchiveOptions {
  readonly includeGit?: boolean;
  readonly maxInputBytes?: number;
}

export interface SourceArchiveWorkProgress {
  readonly percent: number;
  readonly message: string;
}

export interface SourceArchiveExecutionControl {
  readonly signal?: AbortSignal;
  readonly yieldControl?: () => Promise<void>;
}

function isEnvironmentFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower === ".env.example" || /^\.env\..+\.example$/.test(lower)) return false;
  return lower === ".env" || lower.startsWith(".env.");
}

function isExcludedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (EXCLUDED_FILE_NAMES.has(lower) || isEnvironmentFile(lower)) return true;
  if (
    lower === "conftest.py" ||
    lower.startsWith("test_") ||
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes(".stories.") ||
    lower.endsWith("_test.py")
  ) {
    return true;
  }
  return EXCLUDED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function isSourceCodeFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SOURCE_CODE_FILE_NAMES.has(lower) || SOURCE_CODE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function normalizeSelectedPath(path: string): string[] {
  const segments = path.replace(/\\/g, "/").split("/");
  if (
    segments.length < 2 ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("源码文件夹中包含无效的相对路径。");
  }
  return segments;
}

export function decideSourcePath(path: string, options: SourceArchiveOptions = {}): SourcePathDecision {
  const segments = normalizeSelectedPath(path);
  const rootName = segments[0]!;
  if (!isValidWindowsFileName(rootName)) throw new Error("源码文件夹名称无法在 Windows 中使用。");

  const relativeSegments = segments.slice(1);
  const relativePath = relativeSegments.join("/");
  const isGitMetadata = relativeSegments[0]?.toLowerCase() === ".git";
  if (isGitMetadata && options.includeGit) {
    if (relativeSegments.some((segment) => !isValidWindowsFileName(segment))) {
      throw new Error(`Git元数据包含无法在 Windows 中解压的路径：${relativePath}`);
    }
    return { include: true, relativePath, rootName };
  }
  const lowerDirectories = relativeSegments.slice(0, -1).map((segment) => segment.toLowerCase());
  if (lowerDirectories.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) {
    return { include: false, relativePath, rootName };
  }
  if (isExcludedFile(relativeSegments.at(-1)!)) {
    return { include: false, relativePath, rootName };
  }
  if (!isSourceCodeFile(relativeSegments.at(-1)!)) {
    return { include: false, relativePath, rootName };
  }

  if (relativeSegments.some((segment) => !isValidWindowsFileName(segment))) {
    throw new Error(`源码文件夹包含无法在 Windows 中解压的路径：${relativePath}`);
  }

  return { include: true, relativePath, rootName };
}

function createZip(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entries, { level: 9 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

const SOURCE_SELECTION_CHUNK_SIZE = 500;

function defaultYieldControl(): Promise<void> {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

/**
 * Inspect only directory metadata and build the small set of files the Worker
 * actually needs. The browser has already enumerated a `webkitdirectory`
 * selection before this function can run, but dependency blobs do not need to
 * cross the Worker boundary or have their bytes read.
 */
export async function prepareSourceArchiveSelection(
  files: ArrayLike<BrowserSourceFile>,
  onProgress: (progress: SourceArchiveWorkProgress) => void = () => undefined,
  options: SourceArchiveOptions = {},
  control: SourceArchiveExecutionControl = {},
): Promise<PreparedSourceArchiveSelection> {
  throwIfAborted(control.signal);
  if (files.length === 0) throw new Error("未读取到源码文件夹内容。");
  onProgress({ percent: 2, message: `开始扫描 ${files.length.toLocaleString()} 个目录项` });

  const yieldControl = control.yieldControl ?? defaultYieldControl;
  const maxInputBytes = options.maxInputBytes ?? MAX_SOURCE_INPUT_BYTES;
  let rootName = "";
  let excludedFileCount = 0;
  let inputBytes = 0;
  const included: PreparedSourceArchiveFile[] = [];
  let isFrontendProject = false;
  let isPythonProject = false;

  for (let chunkStart = 0; chunkStart < files.length; chunkStart += SOURCE_SELECTION_CHUNK_SIZE) {
    throwIfAborted(control.signal);
    const chunkEnd = Math.min(files.length, chunkStart + SOURCE_SELECTION_CHUNK_SIZE);
    for (let index = chunkStart; index < chunkEnd; index++) {
      const file = files[index]!;
      const decision = decideSourcePath(file.webkitRelativePath, options);
      if (rootName && decision.rootName !== rootName) {
        throw new Error("一次只能选择一个源码文件夹。");
      }
      rootName = decision.rootName;
      const relativePath = decision.relativePath.toLowerCase();
      if (relativePath === "package.json") isFrontendProject = true;
      if (PYTHON_PROJECT_MARKERS.has(relativePath)) isPythonProject = true;
      if (!decision.include) {
        excludedFileCount++;
        continue;
      }
      if (included.length >= MAX_SOURCE_FILES) {
        throw new Error(`过滤后的源码文件超过 ${MAX_SOURCE_FILES.toLocaleString()} 个。`);
      }
      inputBytes += file.size;
      if (inputBytes > maxInputBytes) {
        throw new Error("过滤后的源码文件超过 256 MB，请检查是否仍包含大型生成文件。");
      }
      included.push({ file, path: `${rootName}/${decision.relativePath}` });
    }

    onProgress({
      percent: 2 + chunkEnd / files.length * 28,
      message: `正在筛选目录项 ${chunkEnd.toLocaleString()}/${files.length.toLocaleString()}`,
    });
    throwIfAborted(control.signal);
    await yieldControl();
    throwIfAborted(control.signal);
  }

  if (!isFrontendProject && !isPythonProject) {
    throw new Error(
      "只支持前端工程或 Python 工程，例如 gttk-fm-agent-web、gttk-fm-agent-server。",
    );
  }
  if (included.length === 0) throw new Error("过滤后没有可打包的源码文件。");
  onProgress({
    percent: 32,
    message: `筛选完成：保留 ${included.length.toLocaleString()} 个，排除 ${excludedFileCount.toLocaleString()} 个`,
  });
  await yieldControl();
  throwIfAborted(control.signal);

  return { rootName, included, excludedFileCount, inputBytes };
}

/** Read and compress an already-filtered selection. */
export async function createSourceArchiveFromSelection(
  selection: PreparedSourceArchiveSelection,
  maxArchiveBytes: number,
  onProgress: (progress: SourceArchiveWorkProgress) => void = () => undefined,
  signal?: AbortSignal,
): Promise<SourceArchive> {
  throwIfAborted(signal);
  if (selection.included.length === 0) throw new Error("过滤后没有可打包的源码文件。");

  const entries: Record<string, Uint8Array> = Object.create(null);
  for (let index = 0; index < selection.included.length; index++) {
    throwIfAborted(signal);
    const { file, path } = selection.included[index]!;
    const buffer = await file.arrayBuffer();
    throwIfAborted(signal);
    entries[path] = new Uint8Array(buffer);
    if ((index + 1) % 20 === 0 || index + 1 === selection.included.length) {
      onProgress({
        percent: 32 + (index + 1) / selection.included.length * 38,
        message: `正在读取源码 ${index + 1}/${selection.included.length}`,
      });
    }
  }

  throwIfAborted(signal);
  onProgress({ percent: 75, message: "正在使用最高压缩级别生成 ZIP" });
  const bytes = await createZip(entries);
  throwIfAborted(signal);
  if (bytes.length > maxArchiveBytes) {
    throw new Error(
      `${selection.rootName}-source.zip 压缩后仍超过当前传输上限，请继续精简源码目录。`,
    );
  }
  onProgress({ percent: 95, message: `ZIP 已生成，大小 ${bytes.length.toLocaleString()} 字节` });

  return {
    name: `${selection.rootName}-source.zip`,
    rootName: selection.rootName,
    bytes,
    includedFileCount: selection.included.length,
    excludedFileCount: selection.excludedFileCount,
    inputBytes: selection.inputBytes,
  };
}

export async function createSourceArchive(
  files: ArrayLike<BrowserSourceFile>,
  maxArchiveBytes: number,
  onProgress: (progress: SourceArchiveWorkProgress) => void = () => undefined,
  options: SourceArchiveOptions = {},
  control: SourceArchiveExecutionControl = {},
): Promise<SourceArchive> {
  const selection = await prepareSourceArchiveSelection(files, onProgress, options, control);
  return createSourceArchiveFromSelection(
    selection,
    maxArchiveBytes,
    onProgress,
    control.signal,
  );
}
