# Brand asset sources

- `capacitor/`: source PNG files consumed by `pnpm assets:generate`
- `public/brand/`: UI-facing SVG symbols and wordmarks
- `public/app-icons/`: generated PWA and Apple icon files

Do not edit files in `public/app-icons/` directly. Update the source files in
`assets/capacitor/` and regenerate them instead.
