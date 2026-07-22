import { spawn } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const projectRoot = process.cwd();
const stagingDirectory = resolve(projectRoot, ".app-build");
const stagedOutputDirectory = join(stagingDirectory, "out");
const outputDirectory = resolve(projectRoot, "out");
const pendingOutputDirectory = resolve(projectRoot, ".app-out-next");

const copiedDirectories = ["public", "src"] as const;
const copiedFiles = ["next.config.ts", "package.json", "tsconfig.json"] as const;
const excludedSourceDirectories = [
  join("src", "app", "api"),
  join("src", "generated"),
  join("src", "server"),
] as const;

async function main() {
  assertGeneratedPath(stagingDirectory, ".app-build");
  assertGeneratedPath(pendingOutputDirectory, ".app-out-next");
  assertGeneratedPath(outputDirectory, "out");

  const apiBaseUrl = await resolveApiBaseUrl();

  await rm(stagingDirectory, { recursive: true, force: true });
  await rm(pendingOutputDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });

  try {
    await createAppBuildProjection();
    await assertServerFilesExcluded();

    console.info(`Capacitor API: ${apiBaseUrl}`);
    console.info("서버 전용 파일을 제외한 임시 Next.js 프로젝트를 빌드합니다.");

    await runNextBuild(apiBaseUrl);
    await access(join(stagedOutputDirectory, "index.html"), constants.R_OK);

    await cp(stagedOutputDirectory, pendingOutputDirectory, { recursive: true });
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(pendingOutputDirectory, outputDirectory);

    console.info(`Capacitor 정적 빌드 완료: ${relative(projectRoot, outputDirectory)}`);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
    await rm(pendingOutputDirectory, { recursive: true, force: true });
  }
}

async function createAppBuildProjection() {
  for (const directory of copiedDirectories) {
    const source = resolve(projectRoot, directory);
    const destination = resolve(stagingDirectory, directory);

    await cp(source, destination, {
      recursive: true,
      filter: shouldCopySourcePath,
    });
  }

  for (const filename of copiedFiles) {
    await cp(resolve(projectRoot, filename), resolve(stagingDirectory, filename));
  }
}

function shouldCopySourcePath(sourcePath: string) {
  const projectRelativePath = relative(projectRoot, sourcePath);

  return !excludedSourceDirectories.some(
    (excludedPath) =>
      projectRelativePath === excludedPath ||
      projectRelativePath.startsWith(`${excludedPath}${sep}`),
  );
}

async function assertServerFilesExcluded() {
  for (const excludedPath of excludedSourceDirectories) {
    const stagedPath = resolve(stagingDirectory, excludedPath);

    try {
      await access(stagedPath, constants.F_OK);
      throw new Error(`앱 빌드에 서버 전용 경로가 포함됐습니다: ${excludedPath}`);
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }
}

async function resolveApiBaseUrl() {
  const configuredValue =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    (await readPublicEnvValue("NEXT_PUBLIC_API_BASE_URL"));

  if (!configuredValue) {
    throw new Error(
      "앱 빌드에는 NEXT_PUBLIC_API_BASE_URL이 필요합니다. .env.production 또는 실행 환경에 HTTPS API 주소를 설정해주세요.",
    );
  }

  let url: URL;

  try {
    url = new URL(configuredValue);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL은 유효한 절대 URL이어야 합니다.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Capacitor 앱의 API 주소는 https://로 시작해야 합니다.");
  }

  if (!/^\/api(?:\/|$)/.test(url.pathname)) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL에는 /api 경로가 포함되어야 합니다.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL에는 인증정보, 쿼리 또는 해시를 넣지 마세요.");
  }

  return configuredValue.replace(/\/+$/, "");
}

async function readPublicEnvValue(key: string) {
  const envFiles = [".env.production.local", ".env.production"];

  for (const filename of envFiles) {
    try {
      const contents = await readFile(resolve(projectRoot, filename), "utf8");
      const value = parseEnvValue(contents, key);

      if (value) return value;
    } catch (error) {
      if (isMissingFileError(error)) continue;
      throw error;
    }
  }

  return undefined;
}

function parseEnvValue(contents: string, key: string) {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match || match[1] !== key) continue;

    const value = match[2].trim();
    const quoted = value.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/);

    return (quoted?.[1] ?? quoted?.[2] ?? value).trim();
  }

  return undefined;
}

async function runNextBuild(apiBaseUrl: string) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["exec", "next", "build", stagingDirectory],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
          NEXT_TELEMETRY_DISABLED: "1",
          NODE_ENV: "production",
          TUTI_TARGET: "app",
        },
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(
        new Error(
          signal
            ? `Next.js 앱 빌드가 ${signal} 신호로 종료됐습니다.`
            : `Next.js 앱 빌드가 종료 코드 ${code ?? "unknown"}로 실패했습니다.`,
        ),
      );
    });
  });
}

function assertGeneratedPath(path: string, expectedBasename: string) {
  if (dirname(path) !== projectRoot || basename(path) !== expectedBasename) {
    throw new Error(`안전하지 않은 생성 경로입니다: ${path}`);
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

await main();
