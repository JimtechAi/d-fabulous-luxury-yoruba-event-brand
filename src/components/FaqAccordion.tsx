/**
 * FaqAccordion Component
 * Accessible, interactive accordion for Frequently Asked Questions.
 */

import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export interface FaqItem {
  id: string;
  question: string;
  answer: React.ReactNode;
  category?: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
  defaultOpenId?: string;
  className?: string;
}

export const FaqAccordion: React.FC<FaqAccordionProps> = ({
  items,
  defaultOpenId = 'q1',
  className = '',
}) => {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);

  const toggleItem = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="rounded-xl border border-gold-primary/20 bg-white overflow-hidden shadow-sm transition-all duration-200 hover:border-gold-primary/50"
          >
            <button
              type="button"
              onClick={() => toggleItem(item.id)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${item.id}`}
              id={`faq-button-${item.id}`}
              className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 text-burgundy-rich hover:text-gold-dark focus:outline-none focus:ring-2 focus:ring-gold-primary focus:ring-offset-2 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 pr-2">
                <HelpCircle className="w-5 h-5 text-gold-dark shrink-0" />
                <span className="font-serif font-semibold text-base sm:text-lg leading-snug">
                  {item.question}
                </span>
              </div>
              <div
                className={`p-1.5 rounded-full bg-ivory-warm text-burgundy-rich transition-transform duration-300 shrink-0 ${
                  isOpen ? 'rotate-180 bg-burgundy-rich text-gold-primary' : ''
                }`}
              >
                <ChevronDown className="w-5 h-5" />
              </div>
            </button>

            {isOpen && (
              <div
                id={`faq-answer-${item.id}`}
                role="region"
                aria-labelledby={`faq-button-${item.id}`}
                className="px-5 pb-6 sm:px-6 pt-1 text-neutral-700 text-sm sm:text-base leading-relaxed border-t border-neutral-100 bg-ivory-warm/40 animate-fadeIn"
              >
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
