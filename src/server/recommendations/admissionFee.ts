import type { TutiPlace } from "@/lib/recommendations";
import type { IntakeAnswers } from "@/shared/tuti/types";

export type AdmissionFeeClassification =
  | "confirmed-free"
  | "paid"
  | "unknown";

/**
 * 관광 상세의 자유 형식 요금 문구에서 일반 입장 비용만 보수적으로 판정한다.
 * 일부 대상의 면제나 공연·시설별 가격은 무료 입장을 보장하지 않는다.
 */
export function classifyAdmissionFee(
  value: string | null | undefined,
): AdmissionFeeClassification {
  const normalized = value
    ?.normalize("NFKC")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "unknown";

  const price = String.raw`\d[\d,]*(?:\.\d+)?\s*(?:만\s*)?원`;
  const generalPaid = new RegExp(
    String.raw`(?:성인|어른|일반(?:인|관람객|입장)?|입장료|관람료)[^\d]{0,30}${price}`,
  );
  if (generalPaid.test(normalized)) return "paid";

  const generalFree =
    /(?:전체|전원|누구나|일반(?:인|관람객|입장)?|입장료|관람료|입장|관람)\s*(?:는|은|이|가|:|-)?\s*(?:전면\s*)?무료|무료\s*(?:입장|관람)/;
  if (generalFree.test(normalized)) return "confirmed-free";

  if (/^(?:무료|입장료\s*없음|관람료\s*없음|요금\s*없음)$/.test(normalized)) {
    return "confirmed-free";
  }

  if (
    /(?:공연|시설|프로그램|체험|행사|전시|코스)별|가격\s*상이|요금\s*상이|별도\s*(?:문의|확인)|현장\s*문의|정보\s*없음/.test(
      normalized,
    )
  ) {
    return "unknown";
  }

  return new RegExp(price).test(normalized) ||
    /(?:입장료|관람료)\s*유료/.test(normalized)
    ? "paid"
    : "unknown";
}

export function filterPlacesByAdmissionBudget(
  places: TutiPlace[],
  budget: IntakeAnswers["budget"],
) {
  if (budget !== "free") return places;

  return places.filter(
    (place) => classifyAdmissionFee(place.admissionFee) !== "paid",
  );
}
