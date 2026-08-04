import styled from "@emotion/styled";
import { TutiPlaceIcon } from "@/features/tuti/components/TutiPlaceIcon";

export function JournalLocationLabel({
  className,
  placeName,
}: {
  className?: string;
  placeName: string;
}) {
  return (
    <Label className={className}>
      <TutiPlaceIcon aria-hidden="true" />
      <span>{placeName}</span>
    </Label>
  );
}

const Label = styled.p`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-200);
  font-weight: 500;
  line-height: var(--line-height-subtitle);
  letter-spacing: var(--letter-spacing-subtitle);

  > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
