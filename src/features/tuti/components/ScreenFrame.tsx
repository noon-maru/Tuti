"use client";

import styled from "@emotion/styled";
import { breakpoints } from "@/styles/tokens";

export const ScreenFrame = styled.section`
  --screen-padding-top: calc(var(--space-11) + var(--app-safe-area-top, 0px));
  --screen-padding-right: calc(
    var(--space-6) + var(--app-safe-area-right, 0px)
  );
  --screen-padding-bottom: calc(
    var(--space-7) + var(--app-safe-area-bottom, 0px)
  );
  --screen-padding-left: calc(
    var(--space-6) + var(--app-safe-area-left, 0px)
  );

  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--screen-padding-top) var(--screen-padding-right)
    var(--screen-padding-bottom) var(--screen-padding-left);
  overflow: hidden;

  @media (max-width: ${breakpoints.mobile}px) {
    --screen-padding-right: calc(
      var(--space-5) + var(--app-safe-area-right, 0px)
    );
    --screen-padding-left: calc(
      var(--space-5) + var(--app-safe-area-left, 0px)
    );
  }
`;
