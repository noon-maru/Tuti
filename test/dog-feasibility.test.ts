import test from "node:test";
import assert from "node:assert/strict";
import { dogFeasibility, dogVisitDate, fitsDogTimeBudget } from "@/server/recommendations/dogFeasibility";
import type { TutiPlace } from "@/lib/recommendations";
const place: TutiPlace = { id:"p",name:"동네 카페",image:"",phrase:"",note:"",fatigue:0,movementLevel:"near",moodTags:[],travelTime:"",crowd:"",today:"",distanceMeters:1000,experienceType:"cafe" };
test("늦은 발견 시각만으로 제외하지 않고 명백한 왕복·체류 초과는 제외한다", () => {
  const detail = { openingHours:"10:00~18:00",restDate:null,admissionFee:null };
  const result = dogFeasibility(place,{movement:"near",transport:"transit"},detail,new Date("2026-11-17T23:00:00+09:00"));
  assert.notEqual(result.executionFeasibility?.operationStatus,"closes_too_soon");
  assert.equal(fitsDogTimeBudget(dogFeasibility({...place,distanceMeters:100000},{movement:"near",transport:"transit"},detail,new Date())),false);
});
test("익일 선택은 방문 날짜와 휴무 판정을 동일하게 익일로 적용한다", () => {
  const now=new Date("2026-11-17T10:00:00+09:00");
  assert.equal(dogVisitDate({longDistanceTiming:"tomorrow_day_trip"},now).getTime()-now.getTime(),86400000);
  const result=dogFeasibility(place,{movement:"far",longDistanceTiming:"tomorrow_day_trip"},{openingHours:null,restDate:"매주 수요일",admissionFee:null},now);
  assert.equal(fitsDogTimeBudget(result),false);
});
