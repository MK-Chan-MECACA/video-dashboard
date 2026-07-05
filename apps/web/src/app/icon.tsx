import { ImageResponse } from 'next/og';
import { brandInitials, getBrandName } from '@/lib/brand';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

/** Favicon rendered from the brand name in Settings ("Acme Studio" → AS). */
export default async function Icon() {
  const brandName = await getBrandName();
  const label = brandName ? brandInitials(brandName) : '▶';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#e9b949',
          borderRadius: 12,
          color: '#1c1810',
          fontWeight: 700,
          fontSize: label.length > 2 ? 26 : 32,
          letterSpacing: '-1.5px',
        }}
      >
        {label}
      </div>
    ),
    size,
  );
}
