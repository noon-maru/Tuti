"use client";

import styled from "@emotion/styled";
import { captionStyles } from "@/shared/ui/typography";

export const MadiFieldLabel = styled.span`
  display: block; font-size: var(--ui-body-size); font-weight: 600; line-height: 1.6;
  small { ${captionStyles} display: inline; margin-inline-start: 4px; }
`;
