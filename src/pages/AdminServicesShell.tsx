import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Search, ShieldCheck } from 'lucide-react';
import { Container } from '../components/Container';
import { Button } from '../components/Button';
import { AdminBackToDashboard } from '../components/AdminBackToDashboard';
import { useRouter } from '../lib/router';
import { getCurrentAdmin, signOut } from '../lib/auth';
import { getAdminServices, type AdminServiceRecord } from '../lib/admin';

const serviceCategories = ['all', 'core', 'specialist', 'brand'];

export const AdminServicesShell: React.FC = () => {
  const { navigate } = useRouter();
  const [profile, setProfile] = useState<{ email: string | null; role: string } | null>(null);
  const [items, setItems] = useState<AdminServiceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
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
    const loadServices = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getAdminServices();
        if (!isMounted) return;
        setItems(data);
        setSelectedId((current) => current && data.some((item) => item.id === current) ? current : data[0]?.id || null);
      } catch (loadError: unknown) {
        if (isMounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load services.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void loadServices();
    return () => { isMounted = false; };
  }, [profile]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const searchable = [item.title, item.yoruba_name, item.short_description, item.full_description, item.category, item.slug].filter(Boolean).join(' ').toLowerCase();
      return (!term || searchable.includes(term)) && (category === 'all' || item.category === category);
    });
  }, [category, items, search]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null;

  const handleLogout = async () => {
    await signOut().catch(() => undefined);
    navigate('/admin/login');
  };

  if (!profile) return null;

  return (
    <main className="min-h-screen bg-ivory-warm text-black-rich">
      <header className="border-b border-gold-luxury/30 bg-burgundy-dark text-ivory-warm">
        <Container className="flex items-center justify-between gap-6 py-5">
          <div><p className="text-[10px] uppercase tracking-[0.3em] text-gold-luxury">Private Administration</p><h1 className="font-display text-3xl">D’Fabulous Admin</h1></div>
          <Button variant="outline-light" size="sm" onClick={handleLogout} icon={<ArrowUpRight className="h-4 w-4" />}>LOG OUT</Button>
        </Container>
      </header>
      <div className="p-6 lg:p-10"><Container className="space-y-6">
        <AdminBackToDashboard />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">Services</p><h2 className="font-display text-4xl text-burgundy-deep">Service management</h2><p className="mt-2 max-w-2xl text-charcoal-soft">Review the services presented across the D’Fabulous event experience.</p></div><div className="flex items-center gap-3 border border-gold-luxury/20 bg-white p-3 shadow-sm"><ShieldCheck className="h-4 w-4 text-gold-luxury" /><span className="text-sm text-charcoal-soft capitalize">{profile.role}</span></div></div>
        {error && <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}
        <div className="grid gap-3 border border-gold-luxury/20 bg-white p-4 md:grid-cols-[1fr_auto]"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-dark" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search service name, description, category..." aria-label="Search services" className="w-full border border-gold-luxury/20 bg-ivory-warm py-3 pl-10 pr-3 text-sm text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury" /></div><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter services by category" className="border border-gold-luxury/20 bg-ivory-warm px-3 py-3 text-sm capitalize text-charcoal-soft focus:outline-none focus:ring-2 focus:ring-gold-luxury">{serviceCategories.map((value) => <option key={value} value={value}>{value === 'all' ? 'All categories' : value}</option>)}</select></div>
        {loading ? <div className="border border-gold-luxury/20 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">Loading services...</div> : error ? <div className="border border-amber-300 bg-amber-50 p-10 text-center text-amber-900 shadow-sm">Service data is temporarily unavailable.</div> : filteredItems.length === 0 ? <div className="border border-dashed border-gold-luxury/30 bg-white p-10 text-center text-charcoal-soft/80 shadow-sm">No services found.</div> : <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]"><div className="border border-gold-luxury/20 bg-white shadow-sm"><div className="border-b border-gold-luxury/20 p-4 text-sm text-charcoal-soft">{filteredItems.length} services</div><div className="max-h-[700px] overflow-auto">{filteredItems.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`block w-full border-b border-gold-luxury/10 p-4 text-left ${selectedItem?.id === item.id ? 'bg-ivory-warm' : 'hover:bg-ivory-warm/70'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-burgundy-deep">{item.title}</p><p className="mt-1 text-sm text-charcoal-soft">{item.yoruba_name || item.short_description}</p></div><span className={`px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${item.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></div><p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-gold-dark">{item.category || 'Uncategorized'}</p></button>)}</div></div>{selectedItem && <div className="border border-gold-luxury/20 bg-white p-6 shadow-sm"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Selected service</p><h3 className="mt-2 font-display text-4xl text-burgundy-deep">{selectedItem.title}</h3><p className="mt-2 text-sm uppercase tracking-[0.15em] text-gold-dark">{selectedItem.yoruba_name || 'D’Fabulous service'}</p><dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Category</dt><dd className="mt-1 capitalize text-sm text-charcoal-soft">{selectedItem.category || 'Uncategorized'}</dd></div><div><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Status</dt><dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.is_active ? 'Active' : 'Inactive'}</dd></div><div className="sm:col-span-2"><dt className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Slug</dt><dd className="mt-1 text-sm text-charcoal-soft">{selectedItem.slug}</dd></div></dl><div className="mt-6 border-t border-gold-luxury/20 pt-5"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Short description</p><p className="mt-2 text-sm leading-relaxed text-charcoal-soft">{selectedItem.short_description}</p></div>{selectedItem.full_description && <div className="mt-6 border-t border-gold-luxury/20 pt-5"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">Full description</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-charcoal-soft">{selectedItem.full_description}</p></div>}</div>}</div>}
      </Container></div>
    </main>
  );
};
