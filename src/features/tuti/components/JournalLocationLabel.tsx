import styled from "@emotion/styled";

export function JournalLocationLabel({
  className,
  placeName,
}: {
  className?: string;
  placeName: string;
}) {
  return (
    <Label className={className}>
      <Marker aria-hidden="true" />
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

const Marker = styled.span`
  width: 14px;
  height: 18px;
  flex: 0 0 auto;
  border-radius: 50% 50% 55% 55% / 42% 42% 70% 70%;
  background: linear-gradient(
    to bottom,
    var(--color-secondary-500) 0 50%,
    var(--color-brand-500) 50% 100%
  );
  clip-path: polygon(0 0, 100% 0, 100% 56%, 50% 100%, 0 56%);
`;
