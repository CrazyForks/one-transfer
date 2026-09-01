import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import {
  createSourceArchive,
  createSourceArchiveFromSelection,
  decideSourcePath,
  prepareSourceArchiveSelection,
  type BrowserSourceFile,
} from "../shared/source-archive.ts";

function sourceFile(
  path: string,
  content: string,
  onRead: () => void = () => undefined,
): BrowserSourceFile {
  const bytes = new TextEncoder().encode(content);
  return {
    name: path.split("/").at(-1)!,
    size: bytes.length,
    webkitRelativePath: path,
    async arrayBuffer() {
      onRead();
      return bytes.slice().buffer;
    },
  };
}

function asArrayLike<T>(items: readonly T[]): ArrayLike<T> {
  const input: { length: number; [index: number]: T } = { length: items.length };
  items.forEach((item, index) => { input[index] = item; });
  return input;
}

test("frontend and Python project paths can use any root directory name", () => {
  assert.equal(decideSourcePath("gttk-fm-agent-web/src/main.tsx").include, true);
  assert.equal(decideSourcePath("gttk-fm-agent-server/src/main.py").include, true);
  assert.equal(decideSourcePath("another-frontend/src/main.ts").include, true);
});

test("ordinary folders and unsupported project types are rejected", async () => {
  await assert.rejects(
    createSourceArchive([sourceFile("notes/src/main.ts", "export {}")], 1024 * 1024),
    /只支持前端工程或 Python 工程/,
  );
});

test("dependencies, outputs, caches and local secrets are excluded", () => {
  for (const path of [
    "gttk-fm-agent-web/.git/config",
    "gttk-fm-agent-web/node_modules/react/index.js",
    "gttk-fm-agent-web/dist/index.html",
    "gttk-fm-agent-web/.env.production",
    "gttk-fm-agent-web/.env.production.example",
    "gttk-fm-agent-web/public/pdf.worker.min.js",
    "gttk-fm-agent-web/public/file-viewer/ppt/ppt-native.wasm",
    "gttk-fm-agent-web/public/fonts/title.ttf",
    "gttk-fm-agent-web/README.md",
    "gttk-fm-agent-server/src/__pycache__/main.pyc",
    "gttk-fm-agent-server/.venv/bin/python",
    "gttk-fm-agent-server/runtime.log",
    "gttk-fm-agent-server/local.sqlite3",
  ]) {
    assert.equal(decideSourcePath(path).include, false, path);
  }

  for (const path of [
    "gttk-fm-agent-web/.gitignore",
    "gttk-fm-agent-web/pnpm-lock.yaml",
    "gttk-fm-agent-web/src/main.tsx",
    "gttk-fm-agent-server/requirements.txt",
    "gttk-fm-agent-server/src/main.py",
  ]) {
    assert.equal(decideSourcePath(path).include, true, path);
  }
});

test("source archive keeps one project root and only included code", async () => {
  const archive = await createSourceArchive([
    sourceFile("gttk-fm-agent-web/src/main.tsx", "export const app = true;"),
    sourceFile("gttk-fm-agent-web/package.json", "{}"),
    sourceFile("gttk-fm-agent-web/node_modules/react/index.js", "dependency"),
    sourceFile("gttk-fm-agent-web/dist/index.html", "output"),
    sourceFile("gttk-fm-agent-web/.env.production", "SECRET=value"),
  ], 1024 * 1024);

  assert.equal(archive.name, "gttk-fm-agent-web-source.zip");
  assert.equal(archive.includedFileCount, 2);
  assert.equal(archive.excludedFileCount, 3);
  assert.deepEqual(Object.keys(unzipSync(archive.bytes)).sort(), [
    "gttk-fm-agent-web/package.json",
    "gttk-fm-agent-web/src/main.tsx",
  ]);
});

test("large dependency trees are filtered in yielding chunks before any file bytes are read", async () => {
  const dependencyCount = 4_000;
  let includedReads = 0;
  let excludedReads = 0;
  let yieldCount = 0;
  const progress: number[] = [];
  const files: BrowserSourceFile[] = [
    sourceFile("large-web/package.json", "{}", () => { includedReads++; }),
    ...Array.from({ length: dependencyCount }, (_, index) => ({
      name: "index.js",
      size: 32,
      webkitRelativePath: `large-web/node_modules/package-${index}/index.js`,
      async arrayBuffer() {
        excludedReads++;
        throw new Error("excluded dependency bytes must not be read");
      },
    })),
    sourceFile("large-web/src/main.ts", "export const ready = true;", () => { includedReads++; }),
  ];

  const input = asArrayLike(files);
  const selection = await prepareSourceArchiveSelection(
    input,
    (next) => progress.push(next.percent),
    {},
    {
      yieldControl: async () => {
        yieldCount++;
      },
    },
  );

  assert.equal(selection.included.length, 2);
  assert.deepEqual(selection.included.map(({ path }) => path).sort(), [
    "large-web/package.json",
    "large-web/src/main.ts",
  ]);
  assert.equal(selection.excludedFileCount, dependencyCount);
  assert.equal(excludedReads, 0);
  assert.equal(includedReads, 0);
  assert.equal(yieldCount, Math.ceil(input.length / 500) + 1);
  assert.equal(progress[0], 2);
  assert.equal(progress.at(-1), 32);
  assert.ok(
    progress.every((percent, index) => index === 0 || percent > progress[index - 1]!),
    `progress must increase after every chunk: ${progress.join(", ")}`,
  );

  const archive = await createSourceArchiveFromSelection(selection, 1024 * 1024);
  assert.equal(excludedReads, 0);
  assert.equal(includedReads, 2);
  assert.equal(archive.includedFileCount, 2);
  assert.equal(archive.excludedFileCount, dependencyCount);
  assert.deepEqual(Object.keys(unzipSync(archive.bytes)).sort(), [
    "large-web/package.json",
    "large-web/src/main.ts",
  ]);
});

test("source selection stops at a chunk boundary when aborted", async () => {
  const controller = new AbortController();
  let readCount = 0;
  let yieldCount = 0;
  const progress: number[] = [];
  const files: BrowserSourceFile[] = [
    sourceFile("aborted-web/package.json", "{}", () => { readCount++; }),
    ...Array.from({ length: 3_000 }, (_, index) => sourceFile(
      `aborted-web/node_modules/package-${index}/index.js`,
      "dependency",
      () => { readCount++; },
    )),
    sourceFile("aborted-web/src/main.ts", "export {};", () => { readCount++; }),
  ];

  await assert.rejects(
    prepareSourceArchiveSelection(
      files,
      (next) => progress.push(next.percent),
      {},
      {
        signal: controller.signal,
        yieldControl: async () => {
          yieldCount++;
          if (yieldCount === 2) controller.abort();
        },
      },
    ),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );

  assert.equal(yieldCount, 2);
  assert.equal(readCount, 0);
  assert.ok(progress.at(-1)! < 30);
  assert.equal(progress.includes(32), false);
});
