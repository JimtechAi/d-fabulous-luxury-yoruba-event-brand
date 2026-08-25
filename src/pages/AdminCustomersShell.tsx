import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Search, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { useRouter } from '../lib/router';
import { getCurrentAdmin, signOut } from '../lib/auth';
import { formatAdminDateTime, getAdminBookings, getAdminEnquiries, getStatusClass, titleCase, type AdminBookingRecord, type AdminEnquiryRecord } from '../lib/admin';

interface AdminCustomerRecord {
  key: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  bookings: AdminBookingRecord[];
  enquiries: AdminEnquiryRecord[];
  latestActivity: string | null;
  latestStatus: string | null;
}

function customerKey(fullName: string | null, email: string | null, phone: string | null, source: string, sourceId: string): string {
  return email?.trim().toLowerCase() || phone?.trim() || (fullName ? `name:${fullName.trim().toLowerCase()}` : `${source}:${sourceId}`);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const AdminCustomersShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<{ email: string | null; role: string } | null>(null);
  const [customers, setCustomers] = useState<AdminCustomerRecord[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const verifyAdmin = async () => {
      const result = await getCurrentAdmin();
      if (!isMounted) return;
      if (!result.authorized || !result.profile) {
        navigate('/admin/login');
        return;
      }
      setProfile(result.profile);
    };
    void verifyAdmin();
    return () => { isMounted = false; };
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;
    let isMounted = true;
    const loadCustomers = async () => {
      setLoading(true);
      setError('');
      try {
        const [bookings, enquiries] = await Promise.all([getAdminBookings(), getAdminEnquiries()]);
        if (!isMounted) return;
        const grouped = new Map<string, AdminCustomerRecord>();
        const addCustomer = (fullName: string | null, email: string | null, phone: string | null, source: string, sourceId: string) => {
          const key = customerKey(fullName, email, phone, source, sourceId);
          const existing = grouped.get(key);
          if (existing) {
            existing.full_name ||= fullName;
            existing.email ||= email;
            existing.phone ||= phone;
            return existing;
          }
          const customer = { key, full_name: fullName, email, phone, bookings: [], enquiries: [], latestActivity: null, latestStatus: null };
          grouped.set(key, customer);
          return customer;
        };
        bookings.forEach((booking) => addCustomer(booking.full_name, booking.email, booking.phone, 'booking', booking.id).bookings.push(booking));
        enquiries.forEach((enquiry) => addCustomer(enquiry.full_name, enquiry.email, enquiry.phone, 'enquiry', enquiry.id).enquiries.push(enquiry));
        grouped.forEach((customer) => {
          const activities = [
            ...customer.bookings.map((booking) => ({ date: booking.updated_at || booking.created_at, status: booking.status })),
            ...customer.enquiries.map((enquiry) => ({ date: enquiry.updated_at || enquiry.created_at, status: enquiry.status })),
          ].filter((activity) => activity.date).sort((left, right) => Date.parse(right.date || '') - Date.parse(left.date || ''));
          customer.latestActivity = activities[0]?.date || null;
          customer.latestStatus = activities[0]?.status || null;
        });
        const records = Array.from(grouped.values()).sort((left, right) => (left.full_name || left.email || '').localeCompare(right.full_name || right.email || ''));
        setCustomers(records);
        setSelectedKey((current) => current && records.some((item) => item.key === current) ? current : records[0]?.key || null);
      } catch (loadError: unknown) {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load customers.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void loadCustomers();
    return () => { isMounted = false; };
  }, [profile, navigate]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((customer) => !term || [customer.full_name, customer.email, customer.phone].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [customers, search]);
  const selectedCustomer = filteredCustomers.find((customer) => customer.key === selectedKey) || filteredCustomers[0] || null;

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="bg-burgundy-dark text-ivory-warm border-b border-gold-luxury/30">
        <Container className="flex items-center justify-between gap-6 py-5">
          <div><p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p><h1 className="font-display text-3xl">D’Fabulous Admin</h1></div>
          <Button variant="outline-light" size="sm" onClick={handleLogout} icon={<ArrowUpRight className="w-4 h-4" />}>LOG OUT</Button>
        </Container>
      </header>
      <div className="p-6 lg:p-10"><Container className="space-y-6">
        <AdminBackToDashboard />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Customers</p><h2 className="font-display text-4xl text-burgundy-deep">Customer management</h2></div><div className="flex items-center gap-3 border border-gold-luxury/20 bg-white p-3 shadow-sm"><ShieldCheck className="w-4 h-4 text-gold-luxury" /><span className="text-sm text-charcoal-soft capitalize">{profile.role}</span></div></div>
        {error && <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" /><p>{error}</p></div>}
        <div className="border border-gold-luxury/20 bg-white p-4 shadow-sm"><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-dark" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone..." aria-label="Search customers" className="w-full border border-gold-luxury/20 bg-ivory-warm py-3 pl-10 pr-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" /></div></div>
        {loading ? <div className="border border-gold-luxury/20 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">Loading customers...</div> : error ? <div className="border border-amber-300 bg-amber-50 p-10 text-center text-amber-900 shadow-sm">Customer data is temporarily unavailable.</div> : filteredCustomers.length === 0 ? <div className="border border-dashed border-gold-luxury/30 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">No customers yet. Customers will appear here when they submit a booking or enquiry.</div> : <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]"><div className="border border-gold-luxury/20 bg-white shadow-sm"><div className="border-b border-gold-luxury/20 p-4 text-sm text-charcoal-soft">{filteredCustomers.length} customers</div><div className="max-h-[700px] overflow-auto">{filteredCustomers.map((customer) => <button key={customer.key} type="button" onClick={() => setSelectedKey(customer.key)} className={`block w-full border-b border-gold-luxury/10 p-4 text-left ${selectedCustomer?.key === customer.key ? 'bg-ivory-warm' : 'hover:bg-ivory-warm/70'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-burgundy-deep">{customer.full_name || 'Unnamed customer'}</p><p className="mt-1 text-sm text-charcoal-soft">{customer.email || customer.phone || 'No contact details'}</p></div>{customer.latestStatus && <span className={`px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${getStatusClass(customer.latestStatus)}`}>{titleCase(customer.latestStatus)}</span>}</div><p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-gold-dark">{customer.bookings.length} bookings · {customer.enquiries.length} enquiries · Latest {formatDate(customer.latestActivity)}</p></button>)}</div></div>{selectedCustomer && <div className="border border-gold-luxury/20 bg-white p-6 shadow-sm"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Selected customer</p><h3 className="mt-2 font-display text-4xl text-burgundy-deep">{selectedCustomer.full_name || 'Unnamed customer'}</h3><dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Email</dt><dd className="mt-1 text-sm text-charcoal-soft">{selectedCustomer.email || 'Not provided'}</dd></div><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Phone</dt><dd className="mt-1 text-sm text-charcoal-soft">{selectedCustomer.phone || 'Not provided'}</dd></div><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Booking count</dt><dd className="mt-1 text-sm text-charcoal-soft">{selectedCustomer.bookings.length}</dd></div><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Enquiry count</dt><dd className="mt-1 text-sm text-charcoal-soft">{selectedCustomer.enquiries.length}</dd></div><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Latest activity</dt><dd className="mt-1 text-sm text-charcoal-soft">{formatAdminDateTime(selectedCustomer.latestActivity)}</dd></div><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Current status</dt><dd className="mt-1 text-sm text-charcoal-soft">{selectedCustomer.latestStatus ? titleCase(selectedCustomer.latestStatus) : 'No status'}</dd></div></dl><div className="mt-6 border-t border-gold-luxury/20 pt-5"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Booking history</p>{selectedCustomer.bookings.length ? selectedCustomer.bookings.map((booking) => <p key={booking.id} className="mt-2 text-sm text-charcoal-soft">{formatDate(booking.event_date)} · {booking.event_location || 'Location pending'} · {booking.status || 'pending'}</p>) : <p className="mt-2 text-sm text-charcoal-soft">No bookings.</p>}</div><div className="mt-6 border-t border-gold-luxury/20 pt-5"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Enquiry history</p>{selectedCustomer.enquiries.length ? selectedCustomer.enquiries.map((enquiry) => <p key={enquiry.id} className="mt-2 text-sm text-charcoal-soft">{formatDate(enquiry.created_at)} · {enquiry.subject || 'General enquiry'} · {enquiry.status || 'unread'}</p>) : <p className="mt-2 text-sm text-charcoal-soft">No enquiries.</p>}</div></div>}</div>}
      </Container></div>
    </main>
  );
};
