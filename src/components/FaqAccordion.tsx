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
            className="border border-burgundy-deep/15 bg-ivory-warm overflow-hidden transition-colors duration-300 hover:border-gold-luxury/50"
          >
            <button
              type="button"
              onClick={() => toggleItem(item.id)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${item.id}`}
              id={`faq-button-${item.id}`}
              className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 text-burgundy-deep hover:text-gold-luxury focus:outline-none focus:ring-2 focus:ring-gold-luxury focus:ring-offset-2 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 pr-2">
                <HelpCircle className="w-5 h-5 text-gold-luxury shrink-0" />
                <span className="font-display text-base sm:text-lg font-normal leading-snug">
                  {item.question}
                </span>
              </div>
              <div
                className={`p-1.5 rounded-full bg-ivory-warm text-burgundy-deep transition-transform duration-300 shrink-0 ${
                  isOpen ? 'rotate-180 bg-burgundy-deep text-gold-luxury' : ''
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
                className="px-5 pb-6 sm:px-6 pt-1 text-charcoal-soft/85 text-sm sm:text-base leading-relaxed border-t border-burgundy-deep/10 bg-ivory-warm/40 animate-fadeIn"
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
