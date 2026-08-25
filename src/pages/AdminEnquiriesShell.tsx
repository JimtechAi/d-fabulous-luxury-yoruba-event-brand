import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, LoaderCircle, Search, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { useRouter } from '../lib/router';
import { getCurrentAdmin, signOut } from '../lib/auth';
import { formatAdminDateTime, getAdminEnquiries, getStatusClass, normalizeStatus, titleCase, updateEnquiryStatus, type AdminEnquiryRecord } from '../lib/admin';

const enquiryStatuses = ['unread', 'new', 'contacted', 'follow-up', 'converted', 'replied', 'closed'];

export const AdminEnquiriesShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<{ email: string | null; role: string } | null>(null);
  const [items, setItems] = useState<AdminEnquiryRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    const requestedStatus = new URLSearchParams(window.location.search).get('status');
    return requestedStatus === 'new' || requestedStatus === 'all' ? requestedStatus : 'all';
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (!profile) return;

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getAdminEnquiries();
        if (!isMounted) return;
        setItems(data);
        setSelectedId((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id || null);
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Unable to load enquiries.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [profile]);

  const filteredItems = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter((item) => {
      const itemStatus = (item.status || 'new').trim().toLowerCase();
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'new' ? ['new', 'unread'].includes(itemStatus) : itemStatus === statusFilter);
      const matchesSearch = !term || [
        item.full_name,
        item.email,
        item.subject,
        item.message,
        item.phone,
      ].filter(Boolean).join(' ').toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [items, search, statusFilter]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null;

  useEffect(() => {
    if (!selectedId && filteredItems[0]) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  const handleStatusChange = async (value: string) => {
    if (!selectedItem) return;
    const enquiryId = selectedItem.id;
    setSavingStatus(true);
    setError('');
    setSuccess('');
    try {
      const updatedEnquiry = await updateEnquiryStatus(enquiryId, value);
      setItems((currentItems) => currentItems.map((item) => item.id === enquiryId ? updatedEnquiry : item));
      setSelectedId(enquiryId);
      const updated = await getAdminEnquiries();
      setItems(updated);
      setSelectedId(enquiryId);
      setSuccess('Enquiry status updated.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update enquiry status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="bg-burgundy-dark text-ivory-warm border-b border-gold-luxury/30">
        <Container className="flex items-center justify-between gap-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p>
            <h1 className="font-display text-3xl">D’Fabulous Admin</h1>
          </div>
          <Button variant="outline-light" size="sm" onClick={handleLogout} icon={<ArrowUpRight className="w-4 h-4" />}>
            LOG OUT
          </Button>
        </Container>
      </header>

      <div className="p-6 lg:p-10">
        <Container className="space-y-6">
          <AdminBackToDashboard />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Enquiries</p>
              <h2 className="font-display text-4xl text-burgundy-deep">Client enquiries</h2>
            </div>
            <div className="flex items-center gap-3 rounded-none border border-gold-luxury/20 bg-white p-3 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-gold-luxury" />
              <span className="text-sm text-charcoal-soft capitalize">{profile.role}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{success}</p>
            </div>
          )}

          <div className="rounded-none border border-gold-luxury/20 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gold-dark" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name, email, subject..."
                  className="w-full border border-gold-luxury/20 bg-ivory-warm py-3 pl-10 pr-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury"
              >
                <option value="all">All statuses</option>
                {enquiryStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="rounded-none border border-gold-luxury/20 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">
              Loading enquiries...
            </div>
          ) : error ? (
            <div className="rounded-none border border-amber-300 bg-amber-50 p-10 text-center text-amber-900 shadow-sm">
              <p className="font-display text-2xl text-burgundy-deep">Enquiries are temporarily unavailable.</p>
              <p className="mt-2 text-sm">The messages query returned an error. Check the Supabase RLS policies and try again.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-none border border-dashed border-gold-luxury/30 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">
              No enquiries yet. Client messages and questions will appear here once they start submitting through the website.
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
              <div className="rounded-none border border-gold-luxury/20 bg-white shadow-sm">
                <div className="border-b border-gold-luxury/20 p-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Visible records</p>
                  <p className="mt-1 text-sm text-charcoal-soft">{filteredItems.length} enquiries</p>
                </div>
                <div className="max-h-[700px] overflow-auto">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`block w-full border-b border-gold-luxury/10 p-4 text-left transition-colors ${
                        selectedItem?.id === item.id ? 'bg-ivory-warm' : 'bg-white hover:bg-ivory-warm/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-burgundy-deep">{item.full_name || 'Guest enquiry'}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.15em] text-gold-dark">{item.subject || 'General enquiry'}</p>
                        </div>
                        <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(item.status)}`}>
                          {titleCase(item.status || 'new')}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-charcoal-soft/80">{item.message || 'No message included.'}</p>
                      <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-gold-dark">
                        {new Date(item.created_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedItem ? (
                <div className="rounded-none border border-gold-luxury/20 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-gold-luxury/20 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Selected enquiry</p>
                        <h3 className="font-display text-4xl text-burgundy-deep">{selectedItem.full_name || 'Guest enquiry'}</h3>
                      </div>
                      <span className={`inline-flex rounded-none px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${getStatusClass(selectedItem.status)}`}>
                        {titleCase(selectedItem.status || 'new')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <select
                        value={normalizeStatus(selectedItem.status, 'new')}
                        onChange={(event) => void handleStatusChange(event.target.value)}
                        disabled={savingStatus}
                        className="border border-gold-luxury/20 bg-ivory-warm px-3 py-2 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury"
                      >
                        {enquiryStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </option>
                        ))}
                      </select>
                      {savingStatus && <LoaderCircle className="h-4 w-4 animate-spin text-gold-dark" aria-label="Saving status" />}
                    </div>
                  </div>

                  <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Email</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.email || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Phone</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.phone || 'Not provided'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Subject</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.subject || 'General enquiry'}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Submitted</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">
                        {formatAdminDateTime(selectedItem.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Last updated</dt>
                      <dd className="mt-1 text-sm text-charcoal-soft">
                        {formatAdminDateTime(selectedItem.updated_at)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-6 border-t border-gold-luxury/20 pt-5">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Message</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-charcoal-soft">{selectedItem.message || 'No message provided.'}</p>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Container>
      </div>
    </main>
  );
};
