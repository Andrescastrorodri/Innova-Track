import Link from 'next/link';
import { Waypoints } from 'lucide-react';

export function BrandWordmark() {
  return (
    <Link href="/" className="brand-wordmark">
      <span className="brand-mark" aria-hidden="true">
        <Waypoints size={20} strokeWidth={1.75} />
      </span>
      <span>Innova <span className="brand-wordmark-tail">Track</span></span>
    </Link>
  );
}
