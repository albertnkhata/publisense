import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  MessageSquarePlus, 
  PackagePlus, 
  Sparkles 
} from 'lucide-react';

interface FloatingActionButtonProps {
  onOpenFeedback: () => void;
  onOpenAddProduct: () => void;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onOpenFeedback,
  onOpenAddProduct,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="fixed bottom-6 right-6 z-40" ref={containerRef}>
      {/* Floating Speed Dial Menu */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 mb-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-1.5 space-y-1 animate-in fade-in slide-in-from-bottom-3 duration-150">
          <div className="px-2.5 py-1.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              Create New
            </span>
            <Sparkles className="w-3 h-3 text-zinc-400" />
          </div>

          {/* Option 1: New Feedback */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenFeedback();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-zinc-900 text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-colors flex-shrink-0">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                New Feedback
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                Report a bug, UX issue, or feature idea
              </div>
            </div>
          </button>

          {/* Option 2: Add Product */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenAddProduct();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-zinc-900 text-zinc-700 dark:text-zinc-300 flex items-center justify-center transition-colors flex-shrink-0">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Add Product
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                List a new tool or app on SignalPulse
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Main Circular Floating Action Button with Plus Icon */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-12 h-12 rounded-full bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shadow-xl hover:shadow-2xl transition-all cursor-pointer group active:scale-95"
        aria-label="Create new item"
        title={isOpen ? 'Close menu' : 'Create feedback or add product'}
      >
        <Plus
          className={`w-5 h-5 transition-transform duration-200 ${
            isOpen ? 'rotate-45' : 'group-hover:scale-110'
          }`}
        />
      </button>
    </div>
  );
};
