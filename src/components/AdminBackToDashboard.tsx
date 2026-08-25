import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '../lib/router';

export const AdminBackToDashboard: React.FC = () => (
  <Link
    href="/admin"
    className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-burgundy-deep transition-colors hover:text-gold-luxury focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-luxury focus-visible:ring-offset-2"
    ariaLabel="Back to Dashboard"
  >
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    <span>Back to Dashboard</span>
  </Link>
);
