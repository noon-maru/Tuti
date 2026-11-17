import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessDogDestination } from "@/server/recommendations/dogDestination";
import { selectDogPlaces } from "@/server/recommendations/dogRanking";
import type { TutiPlace } from "@/lib/recommendations";

test("별도로 원문을 검토한 고정 정답과 유형 판정을 대조한다", () => {
  const benchmark = JSON.parse(readFileSync("data/dog-quality-benchmarks/2026-11-17.json","utf8"));
  assert.equal(benchmark.status,"source-reviewed-seed-not-release-approval");
  for (const row of benchmark.cases) {
    const result=assessDogDestination({name:row.name,sourceContentType:row.contentType,phrase:"",note:"",moodTags:[],basicPayload:{lclsSystm3:row.category}});
    assert.equal(result.eligible,row.eligible,row.id); assert.equal(result.type,row.type,row.id);
    assert.ok(row.evidence.length>15);
  }
});
test("품질 검사는 빈 결과만으로 통과하지 않고 알려진 목적 후보를 모두 놓치면 실패한다", () => {
  const base: TutiPlace={id:"cafe",name:"카페우리",image:"",phrase:"",note:"",moodTags:[],fatigue:0,movementLevel:"near",travelTime:"",crowd:"",today:"",experienceType:"cafe"};
  const outing={weightsKg:[],leash:null,carrier:null,purpose:"cafe" as const};
  assert.deepEqual(selectDogPlaces([base,{...base,id:"park",experienceType:"forest_garden"}],[],6,outing).map(p=>p.id),["cafe"]);
});
