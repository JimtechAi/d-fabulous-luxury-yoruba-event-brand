/**
 * GalleryShell Component
 * Photo and video gallery grid shell using neutral media slots.
 */

import React, { useEffect, useState } from 'react';
import { Container } from '../components/Container';
import { PageHero } from '../components/PageHero';
import { GalleryCard } from '../components/GalleryCard';
import { Button } from '../components/Button';
import { SEO } from '../components/SEO';
import { getGalleryItems, DbGalleryItem } from '../lib/db';
import { Camera, Film, Filter } from 'lucide-react';

interface GalleryShellProps {
  type?: 'gallery' | 'videos';
}

export const GalleryShell: React.FC<GalleryShellProps> = ({ type = 'gallery' }) => {
  const isVideo = type === 'videos';
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [dbGallery, setDbGallery] = useState<DbGalleryItem[]>([]);

  useEffect(() => {
    getGalleryItems().then((items) => {
      if (items && items.length > 0) {
        setDbGallery(items);
      }
    });
  }, []);

  const galleryItems = dbGallery.length > 0 
    ? dbGallery.map((item) => ({
        id: item.id,
        category: item.category || 'Traditional Engagement',
        altText: item.alt_text || item.title,
        caption: item.caption,
        imageSrc: item.image_url,
        tag: item.category,
        isPlaceholder: false,
      }))
    : [
        { id: '1', category: 'Alaga Ijoko', altText: 'Bride Family Host & Ancestral Protocols', tag: 'Traditional Engagement', imageSrc: '', isPlaceholder: true },
        { id: '2', category: 'Alaga Iduro', altText: 'Groom Family Spokesperson Entrance', tag: 'Groom Delegation', imageSrc: '', isPlaceholder: true },
        { id: '3', category: 'Eru Iyawo', altText: 'Dowry Gift Presentation & Package Styling', tag: 'Gift Curation', imageSrc: '', isPlaceholder: true },
        { id: '4', category: 'Wedding MC', altText: 'High Energy Reception MC Direction', tag: 'Wedding Reception', imageSrc: '', isPlaceholder: true },
        { id: '5', category: 'Destination Events', altText: 'European Chateau Destination Traditional Ceremony', tag: 'International', imageSrc: '', isPlaceholder: true },
        { id: '6', category: 'Alaga Ijoko', altText: 'Bridal Unveiling & Family Blessing Rituals', tag: 'Bridal Rites', imageSrc: '', isPlaceholder: true },
        { id: '7', category: 'Wedding MC', altText: 'Couples Grand Entrance & Celebration', tag: 'Reception', imageSrc: '', isPlaceholder: true },
        { id: '8', category: 'Private Events', altText: 'Milestone Gala Celebration Hosting', tag: 'Private Gala', imageSrc: '', isPlaceholder: true },
        { id: '9', category: 'Eru Iyawo', altText: 'Traditional Dowry Inspection Ceremonies', tag: 'Cultural Rites', imageSrc: '', isPlaceholder: true },
      ];

  const videoItems = [
    { id: 'v1', category: 'Alaga Hosting Highlights', altText: 'Live Alaga Iduro & Alaga Ijoko Ceremonial Excerpts', tag: 'Cinematic Reel' },
    { id: 'v2', category: 'Wedding MC Reception Highlights', altText: 'High-Energy Reception Entrance & Crowd Engagement', tag: 'Reception Highlight' },
    { id: 'v3', category: 'Destination Yoruba Engagement', altText: 'European Destination Traditional Marriage Highlights', tag: 'Destination Reel' },
    { id: 'v4', category: 'Eru Iyawo Unveiling Protocols', altText: 'Opulent Dowry Presentation Ceremony Video Archive', tag: 'Cultural Reel' },
  ];

  const items = isVideo ? videoItems : galleryItems;
  const filteredItems = activeFilter === 'all' 
    ? items 
    : items.filter((item) => item.category.toLowerCase().includes(activeFilter.toLowerCase()) || item.tag.toLowerCase().includes(activeFilter.toLowerCase()));

  return (
    <>
      <SEO
        title={isVideo ? "Cinematic Video Highlights | D’Fabulous Yoruba Events" : "Event Gallery | D’Fabulous Luxury Yoruba Events"}
        description={isVideo ? "Watch video highlights of live Alaga Iduro, Alaga Ijoko, and wedding MC hosting at luxury venues across the UK and internationally." : "Visual highlights capturing traditional engagement ceremonies, Alaga hosting, dowry presentations, and luxury wedding receptions."}
      />

      <PageHero
        title={isVideo ? "Cinematic Event Highlights" : "Gallery of Celebrations"}
        subtitle={isVideo ? "Experience the vibrant energy, articulate Yoruba oratory, and joyful atmosphere captured across live events." : "Curated photography from luxury Yoruba traditional engagements, Alaga ceremonies, and wedding receptions across the UK and internationally."}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Experience', href: '/experience' },
          { label: isVideo ? 'Videos' : 'Gallery' },
        ]}
      />

      <section className="py-16 sm:py-24 bg-ivory-warm">
        <Container>
          
          {/* Category Filters */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeFilter === 'all'
                  ? 'bg-burgundy-rich text-gold-primary'
                  : 'bg-white border border-neutral-300 text-neutral-700 hover:border-gold-primary'
              }`}
            >
              All Media
            </button>
            <button
              onClick={() => setActiveFilter('alaga')}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeFilter === 'alaga'
                  ? 'bg-burgundy-rich text-gold-primary'
                  : 'bg-white border border-neutral-300 text-neutral-700 hover:border-gold-primary'
              }`}
            >
              Alaga Hosting
            </button>
            <button
              onClick={() => setActiveFilter('wedding')}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeFilter === 'wedding'
                  ? 'bg-burgundy-rich text-gold-primary'
                  : 'bg-white border border-neutral-300 text-neutral-700 hover:border-gold-primary'
              }`}
            >
              Wedding MC
            </button>
            <button
              onClick={() => setActiveFilter('eru')}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeFilter === 'eru'
                  ? 'bg-burgundy-rich text-gold-primary'
                  : 'bg-white border border-neutral-300 text-neutral-700 hover:border-gold-primary'
              }`}
            >
              Eru Iyawo
            </button>
            <button
              onClick={() => setActiveFilter('destination')}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeFilter === 'destination'
                  ? 'bg-burgundy-rich text-gold-primary'
                  : 'bg-white border border-neutral-300 text-neutral-700 hover:border-gold-primary'
              }`}
            >
              Destination Events
            </button>
          </div>

          {/* Media Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredItems.map((item) => (
              <GalleryCard
                key={item.id}
                imageSrc={item.imageSrc}
                altText={item.altText}
                caption={item.caption}
                category={item.category}
                isPlaceholder={item.isPlaceholder ?? true}
              />
            ))}
          </div>

          {/* CTA Banner */}
          <div className="mt-16 p-8 sm:p-12 rounded-2xl bg-burgundy-rich text-white text-center space-y-6">
            <h3 className="font-serif text-3xl font-bold text-gold-primary">
              Ready to Create Unforgettable Memories?
            </h3>
            <p className="text-neutral-200 max-w-2xl mx-auto leading-relaxed">
              Inquire today regarding date availability and ceremonial direction for your upcoming wedding or traditional engagement.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button variant="primary" href="/book">
                BOOK D’FABULOUS
              </Button>
              <Button variant="outline-light" href="/contact">
                CONTACT CONSULTATIONS
              </Button>
            </div>
          </div>

        </Container>
      </section>
    </>
  );
};

