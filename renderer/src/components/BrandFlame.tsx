/** Flama de la marca HellMC (dibuix propi; mateix traç que `HellMC-Client-Panel/frontend/src/design/brand/flame.svg`). */
export function BrandFlame({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="HellMC">
      <defs>
        <linearGradient id="hmf-outer" x1="32" y1="3" x2="32" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#FF9A4A" />
          <stop offset=".5" stop-color="#FF5A36" />
          <stop offset="1" stop-color="#C7330F" />
        </linearGradient>
        <linearGradient id="hmf-inner" x1="32" y1="30" x2="32" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#FFE9A8" />
          <stop offset="1" stop-color="#FFB454" />
        </linearGradient>
      </defs>
      <path fill="url(#hmf-outer)" d="M33.6 3.2c1.1 8.9 5.8 12.7 10.4 18.7C48.2 27.5 50.2 32.5 50.2 38c0 11.8-8.7 20.8-18.2 20.8S13.8 49.800 13.800 38c0-6.300 3-10.900 6.500-14.700 1.200 4.700 3.800 7.300 6.700 7.900C25.800 22.400 28.500 9.200 33.600 3.200z" />
      <path fill="url(#hmf-inner)" d="M32.400 31.600c.8 5.300 5.800 7.500 5.800 13.400 0 5.200-3.700 9-7.800 9S23 50.200 23 45.300c0-3.900 2.300-6.300 4.200-8.900.7 2.200 1.900 3.100 3.300 3.200.2-3.600.3-6.200 1.900-8z" />
    </svg>
  )
}
