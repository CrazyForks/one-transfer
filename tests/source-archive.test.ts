import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import {
  createSourceArchive,
  decideSourcePath,
  type BrowserSourceFile,
} from "../shared/source-archive.ts";

function sourceFile(path: string, content: string): BrowserSourceFile {
  const bytes = new TextEncoder().encode(content);
  return {
    name: path.split("/").at(-1)!,
    size: bytes.length,
    webkitRelativePath: path,
    async arrayBuffer() {
      return bytes.slice().buffer;
    },
  };
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
