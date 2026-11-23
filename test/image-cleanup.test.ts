import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const plan = JSON.parse(await readFile("scripts/ops/image-cleanup-20261123.json", "utf8")) as {
  images: Array<{ idPrefix: string; reference: string }>;
};
const candidate = plan.images[0];
const imageId = `sha256:${candidate.idPrefix}${"0".repeat(52)}`;
const mock = `import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const config=JSON.parse(readFileSync(root+'config.json','utf8'));
const args=process.argv.slice(2);
if(args[0]==='ps') { if(config.failContainers)process.exit(1);console.log('fixture-container'); }
else if(args[0]==='container'&&args[1]==='inspect')console.log(config.containerImage);
else if(args[0]==='info')console.log('fixture');
else if(args[0]==='image'&&args[1]==='inspect'){
 const ref=args.at(-1),image=config.images.find(i=>i.tags.includes(ref)||i.id===ref||i.id.slice(7).startsWith(ref));
 if(!image)process.exit(1);
 if(args[3].includes('"tags"'))console.log(JSON.stringify(image));
 else console.log(config.raceTag===ref?'sha256:'+ '9'.repeat(64):image.id);
}
else if(args[0]==='image'&&args[1]==='rm'){
 if(args.length!==3||args[2].startsWith('-'))process.exit(2);
 appendFileSync(root+'mutations',args[2]+'\\n');
 const image=config.images.find(i=>i.tags.includes(args[2]));if(!image)process.exit(1);
 image.tags=image.tags.filter(t=>t!==args[2]);config.images=config.images.filter(i=>i.tags.length);
 writeFileSync(root+'config.json',JSON.stringify(config));
}else process.exit(2);`;

type FixtureOptions = { tags?: string[]; used?: boolean; rollback?: boolean; failContainers?: boolean; raceTag?: string; pending?: boolean };
async function fixture(t: test.TestContext, options: FixtureOptions = {}) {
  const root = await mkdtemp(join(process.cwd(), ".image-cleanup-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts/ops"), { recursive: true });
  await mkdir(join(root, ".ops-state/deploy"), { recursive: true });
  await copyFile("scripts/ops/tuti-image-cleanup", join(root, "scripts/ops/tuti-image-cleanup"));
  await copyFile("scripts/ops/image-cleanup-20261123.json", join(root, "scripts/ops/image-cleanup-20261123.json"));
  const refs = ["tuti:prod-aaaaaaaaaaaa", "tuti:ops-bbbbbbbbbbbb", "tuti:prod-cccccccccccc", "tuti:ops-cccccccccccc", "tuti:prod", "tuti:ops", "tuti:dev", "postgis/postgis:17-3.5", "dxflrs/garage:v2.3.0"];
  const images = refs.map((tag, index) => ({ id: `sha256:${(index + 1).toString(16).repeat(64)}`, tags: [tag] }));
  images.push({ id: imageId, tags: [candidate.reference, ...(options.tags ?? [])] });
  await writeFile(join(root, "config.json"), JSON.stringify({ images, containerImage: options.used ? imageId : images[0].id, failContainers: options.failContainers, raceTag: options.raceTag }));
  const previous = options.rollback ? candidate.reference : refs[2];
  await writeFile(join(root, ".ops-state/deploy/releases.env"), `current_image=${refs[0]}\ncurrent_ops_image=${refs[1]}\nprevious_image=${previous}\n`);
  if (options.pending) await writeFile(join(root, ".ops-state/privacy-activation/pending"), "pending").catch(async () => {
    await mkdir(join(root, ".ops-state/privacy-activation"));
    await writeFile(join(root, ".ops-state/privacy-activation/pending"), "pending");
  });
  await writeFile(join(root, "docker.mjs"), mock);
  await mkdir(join(root, "bin"));
  await writeFile(join(root, "bin/docker"), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, "docker.mjs"))} "$@"\n`, { mode: 0o700 });
  await writeFile(join(root, "bin/id"), "#!/bin/sh\nprintf '0\\n'\n", { mode: 0o700 });
  await writeFile(join(root, "bin/git"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  return { root, run: (...args: string[]) => spawnSync("sh", [join(root, "scripts/ops/tuti-image-cleanup"), ...args], { env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` }, encoding: "utf8" }),
    mutations: () => readFile(join(root, "mutations"), "utf8").catch(() => "") };
}

test("승인 목록은 Tuti 미사용 79개만 포함하고 현재·롤백·타 서비스는 포함하지 않는다", () => {
  assert.equal(plan.images.length, 79);
  assert.equal(new Set(plan.images.map(i => i.idPrefix)).size, 79);
  for (const image of plan.images) assert.match(image.reference, /^(tuti:|ghcr\.io\/noon-maru\/tuti-)/);
  for (const suffix of ["f475ef8a1c72", "5d6d512b806d"]) assert.ok(plan.images.every(i => !i.reference.includes(suffix)));
});
test("조회 모드는 삭제하지 않고 없는 이미지는 제외한다", async t => {
  const f = await fixture(t); const r = f.run();
  assert.equal(r.status, 0, r.stderr); assert.equal(await f.mutations(), "");
  const result = JSON.parse(r.stdout); assert.equal(result.eligible, 1); assert.equal(result.alreadyMissing, 78);
});
test("적용은 같은 승인 이미지의 Tuti·GHCR 별칭만 비강제로 지운다", async t => {
  const alias = `ghcr.io/noon-maru/tuti-web:${"a".repeat(40)}`;
  const f = await fixture(t, { tags: [alias] }); const r = f.run("--apply");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual((await f.mutations()).trim().split("\n"), [candidate.reference, alias]);
  assert.equal(JSON.parse(r.stdout).removed, 1);
});
for (const [label, options] of [["컨테이너 참조", { used: true }], ["롤백 참조", { rollback: true }], ["타 서비스 별칭", { tags: ["routy-prod-web:latest"] }]] as Array<[string, FixtureOptions]>) {
  test(`${label} 이미지는 보존한다`, async t => {
    const f = await fixture(t, options); const r = f.run("--apply");
    assert.equal(r.status, 0, r.stderr); assert.equal(await f.mutations(), ""); assert.equal(JSON.parse(r.stdout).protected, 1);
  });
}
for (const [label, options] of [["컨테이너 조회 실패", { failContainers: true }], ["태그 변경", { raceTag: candidate.reference }], ["복원 확인 대기", { pending: true }]] as Array<[string, FixtureOptions]>) {
  test(`${label} 시 삭제하지 않는다`, async t => {
    const f = await fixture(t, options); const r = f.run("--apply");
    assert.notEqual(r.status, 0); assert.equal(await f.mutations(), "");
  });
}
