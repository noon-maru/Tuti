import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("이미지 정리는 현재·직전·모든 컨테이너와 타 서비스 태그를 보존한다", async t => {
  if (spawnSync("jq", ["--version"]).status !== 0) { t.skip("운영 NAS의 jq가 필요한 셸 대역 시험"); return; }
  const root = await mkdtemp(join(process.cwd(), ".image-cleanup-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); await mkdir(bin);
  await mkdir(join(root, ".ops-state/deploy"), { recursive: true });
  await writeFile(join(root, ".ops-state/deploy/releases.env"), "current_image=tuti:prod-current\ncurrent_ops_image=tuti:ops\nprevious_image=tuti:prod-69041e486e06\nprevious_release=69041e486e06\n");
  const entries = [
    ["tuti", "prod-current", "current"], ["tuti", "ops", "current-ops"],
    ["tuti", "prod-69041e486e06", "previous"], ["tuti", "ops-69041e486e06", "previous-ops"],
    ["ghcr.io/noon-maru/tuti-ops", "69041e486e067d3b1fefc877971bab005cf2919c", "previous-ops"],
    ["tuti", "prod-34e7591412b8", "old"], ["ghcr.io/noon-maru/tuti-web", "34e7591412b878c08bf2430dc6f04bfe9f17d265", "old"],
    ["ghcr.io/noon-maru/tuti-web", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "stopped-container"],
    ["tuti", "dev", "dev"], ["other-service", "latest", "other"], ["<none>", "<none>", "dangling"],
  ].map(([Repository, Tag, ID]) => ({ Repository, Tag, ID }));
  await writeFile(join(root, "images.json"), JSON.stringify(entries));
  const log = join(root, "calls");
  const driver = join(root, "driver.cjs");
  await writeFile(driver, `const fs=require('node:fs');const args=process.argv.slice(2);const images=JSON.parse(fs.readFileSync(process.env.TEST_IMAGES,'utf8'));fs.appendFileSync(process.env.TEST_LOG,JSON.stringify(args)+'\\n');
if(args[0]==='container'&&args[1]==='ls')console.log('stopped');
if(args[0]==='container'&&args[1]==='inspect')console.log('stopped-container');
if(args[0]==='image'&&args[1]==='ls')for(const row of images)console.log(JSON.stringify(row));
if(args[0]==='image'&&args[1]==='inspect'){
 const row=images.find(x=>x.Repository+':'+x.Tag===args.at(-1));if(!row)process.exit(1);
 if(args.includes('{{json .RepoTags}}'))console.log(JSON.stringify([args.at(-1)]));else console.log(row.ID);
}`);
  await writeFile(join(bin, "docker"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(driver)} "$@"\n`, { mode: 0o700 });
  await writeFile(join(bin, "id"), "#!/bin/sh\necho 0\n", { mode: 0o700 });
  await writeFile(join(bin, "flock"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const source = readFileSync("scripts/ops/tuti-unused-images-cleanup", "utf8")
    .replaceAll("/var/services/homes/Tutiadmin/source/Tuti", root)
    .replaceAll("/usr/bin/flock", join(bin, "flock"));
  const script = join(root, "cleanup.sh"); await writeFile(script, source);
  const run = (args: string[]) => spawnSync("sh", [script, ...args], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_IMAGES: join(root, "images.json"), TEST_LOG: log }, timeout: 10_000 });
  const preview = run([]); assert.equal(preview.status, 0, preview.stderr);
  let calls = (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
  assert.ok(calls.every(args => !args.includes("rm") && !args.includes("prune")));
  await writeFile(log, "");
  const applied = run(["--apply"]); assert.equal(applied.status, 0, applied.stderr);
  calls = (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
  assert.deepEqual(calls.filter(args => args[0] === "image" && args[1] === "rm").map(args => args.at(-1)), ["tuti:prod-34e7591412b8", "ghcr.io/noon-maru/tuti-web:34e7591412b878c08bf2430dc6f04bfe9f17d265"]);
  assert.deepEqual(calls.find(args => args.includes("prune")), ["image", "prune", "--force"]);
  assert.ok(calls.every(args => !args.includes("--all") && !args.includes("-a") && args[0] !== "volume"));
  await writeFile(log, "");
  await rm(join(root, ".ops-state/deploy/releases.env"));
  assert.notEqual(run(["--apply"]).status, 0);
  assert.equal(await readFile(log, "utf8"), "");
});
