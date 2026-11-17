import type { DogOuting } from "./dogAccess";

/** Facts extracted from explicit source expressions. Unrecognized text stays unknown. */
export function dogConditions(areas: string, text: string, reviewed = false) {
  const bounds = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|㎏|킬로그램)\s*(이하|미만|이내)/gi)]
    .map(m => ({ weight: Number(m[1]), exclusive: m[2] === "미만", evidence: m[0] })).filter(b => b.weight > 0 && b.weight <= 150)
    .sort((a,b) => a.weight-b.weight || Number(b.exclusive)-Number(a.exclusive));
  // Do not apply an indoor-only rule to outdoor visitors, or turn A-or-B into A-and-B.
  const neutral = text.split(/[,;\n.]/).filter(line => !/실내|야외|실외|테라스|또는|혹은/.test(line)).join("\n");
  const required = (names: string) => new RegExp(`(?:${names})\\s*(?:착용|사용|지참)?\\s*(?:필수|의무|해야)`, "u").test(neutral);
  const zone = (name: string) => {
    const denied = new RegExp(`(?:${name})[^,;\\n.]{0,8}(?:불가|금지|불가능)`, "u").test(text);
    const allowed = new RegExp(`(?:${name})[^,;\\n.]{0,16}(?:동반\\s*가능|이용\\s*가능|출입\\s*가능|입장\\s*가능)`, "u").test(text)
      || reviewed && new RegExp(name, "u").test(areas) || /실내(?:외|·외|\/외)\s*(?:모두\s*)?(?:동반|이용|출입)?\s*가능/u.test(text);
    return denied ? false : allowed ? true : null;
  };
  const dogs = [...text.matchAll(/(?:최대\s*(\d+)\s*마리|(\d+)\s*마리\s*(?:까지|이하))/g)].map(m => Number(m[1] ?? m[2])).filter(n => n > 0);
  return { maxWeightKg: bounds[0]?.weight ?? null, weightLimitExclusive: bounds[0]?.exclusive ?? false,
    weightEvidence: bounds[0]?.evidence ?? null, indoor: zone("실내"), outdoor: zone("야외|실외|테라스"),
    leashRequired: required("목줄|리드줄|리드선"), carrierRequired: required("이동장|켄넬|캐리어"), muzzleRequired: required("입마개"),
    maxDogs: dogs.length ? Math.min(...dogs) : null };
}

export function dogConditionsBlocked(conditions: ReturnType<typeof dogConditions>, outing?: DogOuting) {
  if (!outing) return false;
  if (outing.space === "indoor" && conditions.indoor !== true || outing.space === "outdoor" && conditions.outdoor !== true) return true;
  if (conditions.maxWeightKg !== null && outing.weightsKg.some(w => conditions.weightLimitExclusive ? w >= conditions.maxWeightKg! : w > conditions.maxWeightKg!)) return true;
  if (conditions.maxDogs !== null && outing.weightsKg.length > conditions.maxDogs) return true;
  return conditions.leashRequired && outing.leash === false || conditions.carrierRequired && outing.carrier === false || conditions.muzzleRequired && outing.muzzle === false;
}
