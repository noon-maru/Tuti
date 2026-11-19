import assert from "node:assert/strict";
import { resolve, sep } from "node:path";
import test from "node:test";
import ts from "typescript";

test("추천 응답 타입은 서버 소스가 없는 네이티브 빌드에서도 검사할 수 있다", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  assert.equal(config.error, undefined);
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const compilerOptions = { ...options, noEmit: true, incremental: false };
  const host = ts.createCompilerHost(compilerOptions);
  const originalExists = host.fileExists.bind(host);
  const originalRead = host.readFile.bind(host);
  const excluded = [resolve("src/server") + sep, resolve("src/generated") + sep];
  const available = (file: string) => !excluded.some(path => resolve(file).startsWith(path));
  host.fileExists = file => available(file) && originalExists(file);
  host.readFile = file => available(file) ? originalRead(file) : undefined;
  const program = ts.createProgram({
    rootNames: ["src/lib/recommendations.ts", "src/shared/api/recommendations.ts", "src/shared/api/admin.ts"],
    options: compilerOptions,
    host,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  }));
});
