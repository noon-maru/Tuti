import { lstat, readlink, symlink } from "node:fs/promises";
import path from "node:path";

const projectDirectory = path.resolve("ios/App");
const xcodeProjectName = "Tuti.xcodeproj";
const xcodeProjectPath = path.join(projectDirectory, xcodeProjectName);
const capacitorProjectPath = path.join(projectDirectory, "App.xcodeproj");

await assertDirectory(xcodeProjectPath, "Tuti Xcode 프로젝트");

const capacitorProject = await lstat(capacitorProjectPath).catch((error) => {
  if (isMissingFileError(error)) return null;
  throw error;
});

if (!capacitorProject) {
  await symlink(xcodeProjectName, capacitorProjectPath, "dir");
  console.log("Capacitor용 App.xcodeproj 호환 링크를 생성했습니다.");
} else if (!capacitorProject.isSymbolicLink()) {
  throw new Error(
    "ios/App/App.xcodeproj가 심볼릭 링크가 아닙니다. Tuti.xcodeproj와 중복된 프로젝트를 정리해주세요.",
  );
} else {
  const target = await readlink(capacitorProjectPath);
  if (target !== xcodeProjectName) {
    throw new Error(
      `ios/App/App.xcodeproj가 ${target}을 가리킵니다. ${xcodeProjectName}을 가리켜야 합니다.`,
    );
  }
}

async function assertDirectory(targetPath: string, label: string) {
  const entry = await lstat(targetPath).catch((error) => {
    if (isMissingFileError(error)) return null;
    throw error;
  });

  if (!entry?.isDirectory()) {
    throw new Error(`${label}를 ${targetPath}에서 찾지 못했습니다.`);
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
