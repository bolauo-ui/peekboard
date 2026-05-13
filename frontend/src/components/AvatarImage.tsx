import { useEffect, useState } from 'react';

// Shared avatar primitive used by the dashboard / settings / comment lists.
// Renders the user-uploaded photo if available, otherwise the existing
// letter-on-color circle that the rest of the app expects.
//
// If the image fetch fails (e.g. the file was deleted but the URL is still
// on the user record), we swap to the letter circle automatically.

interface Props {
  name: string;
  color: string;
  url?: string | null;
  size?: number;          // pixel size of the circle
  ring?: boolean;         // 2-px white ring (used for stacked avatars)
}

export default function AvatarImage({ name, color, url, size = 28, ring = false }: Props) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const fontSize = size <= 18 ? 9 : size <= 22 ? 10 : size <= 28 ? 11 : 14;

  // Reset the "broken image" flag whenever the source URL actually changes
  // — a fresh upload should clear the previous failure.
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);

  const baseStyle: React.CSSProperties = {
    width: size, height: size,
    borderRadius: '50%',
    boxShadow: ring ? '0 0 0 2px #fff' : undefined,
    flexShrink: 0,
  };

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name}
        onError={() => setBroken(true)}
        style={{ ...baseStyle, objectFit: 'cover', display: 'inline-block' }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center text-white font-bold"
      style={{
        ...baseStyle,
        background: color || '#888',
        fontSize,
      }}
    >
      {initial}
    </div>
  );
}
