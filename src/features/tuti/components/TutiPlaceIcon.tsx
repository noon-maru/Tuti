import styled from "@emotion/styled";

export const TutiPlaceIcon = styled.span<{ $size?: "small" | "medium" }>`
  width: ${({ $size = "medium" }) => ($size === "small" ? 11 : 14)}px;
  height: ${({ $size = "medium" }) => ($size === "small" ? 14 : 18)}px;
  display: inline-block;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50% 50% 55% 55% / 42% 42% 70% 70%;
  background: linear-gradient(
    to bottom,
    var(--color-secondary-500) 0 50%,
    var(--color-brand-500) 50% 100%
  );
  clip-path: polygon(0 0, 100% 0, 100% 56%, 50% 100%, 0 56%);
`;
