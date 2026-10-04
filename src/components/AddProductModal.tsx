import React, { useState } from 'react';
import { 
  X, 
  PackagePlus, 
  Globe, 
  Twitter, 
  Sparkles, 
  Building2, 
  Check, 
  Layers
} from 'lucide-react';
import { Product } from '../types';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (product: Product) => void;
  existingProducts: Product[];
}

const CATEGORY_PRESETS = [
  'Developer Tools',
  'AI Assistant & Coding',
  'AI Chat & Reasoning',
  'Design & Creative',
  'Productivity & Collaboration',
  'Database & Backend',
  'Infrastructure',
  'Other',
];

const DEFAULT_LOGOS = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=128&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=128&auto=format&fit=crop&q=80',
];

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  onAddProduct,
  existingProducts,
}) => {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [category, setCategory] = useState(CATEGORY_PRESETS[0]);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLogo, setSelectedLogo] = useState(DEFAULT_LOGOS[0]);
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Product name is required');
      return;
    }

    if (!tagline.trim()) {
      setError('Tagline is required');
      return;
    }

    // Check duplicate name
    const isDuplicate = existingProducts.some(
      (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      setError(`A product named "${trimmedName}" already exists on SignalPulse.`);
      return;
    }

    // Normalize website URL
    let formattedWebsite = websiteUrl.trim();
    if (formattedWebsite && !/^https?:\/\//i.test(formattedWebsite)) {
      formattedWebsite = `https://${formattedWebsite}`;
    }

    // Generate slug & ID
    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const id = `prod-${slug || Date.now()}`;

    // Final Logo
    const logo = customLogoUrl.trim() || selectedLogo;

    const newProduct: Product = {
      id,
      name: trimmedName,
      slug,
      tagline: tagline.trim(),
      description: description.trim() || tagline.trim(),
      logo,
      category,
      verifiedOwner: false,
      websiteUrl: formattedWebsite || 'https://example.com',
      twitterHandle: twitterHandle.trim()
        ? (twitterHandle.startsWith('@') ? twitterHandle.trim() : `@${twitterHandle.trim()}`)
        : `@${slug}`,
      companyName: companyName.trim() || trimmedName,
      totalFeedbackCount: 0,
      resolvedFeedbackCount: 0,
      responsivenessRate: 100,
      followersCount: 1,
      isTrending: false,
      isFeatured: false,
    };

    onAddProduct(newProduct);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-2xs">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-white">
                Add a Product
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Track community feedback and issues for this product
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Product Name & Tagline */}
          <div className="space-y-3">
            <div>
              <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Supabase, Linear, Resend..."
                className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
              />
            </div>

            <div>
              <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                One-line Tagline <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. The open source Firebase alternative"
                className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
              Category
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_PRESETS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    category === cat
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-2xs font-semibold'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Links & Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Website URL
              </label>
              <div className="relative flex items-center">
                <Globe className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full pl-8 pr-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Twitter / X Handle
              </label>
              <div className="relative flex items-center">
                <Twitter className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={twitterHandle}
                  onChange={(e) => setTwitterHandle(e.target.value)}
                  placeholder="@handle"
                  className="w-full pl-8 pr-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Company Name */}
          <div>
            <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              Company or Creator Name (optional)
            </label>
            <div className="relative flex items-center">
              <Building2 className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Supabase Inc, Vercel..."
                className="w-full pl-8 pr-2.5 py-2 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Logo Picker */}
          <div>
            <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              Logo Icon
            </label>
            <div className="flex items-center gap-2 mb-2">
              {DEFAULT_LOGOS.map((logo, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedLogo(logo);
                    setCustomLogoUrl('');
                  }}
                  className={`w-8 h-8 rounded-lg overflow-hidden border-2 transition-all cursor-pointer relative ${
                    selectedLogo === logo && !customLogoUrl
                      ? 'border-zinc-900 dark:border-white scale-105'
                      : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={logo} alt="Preset logo" className="w-full h-full object-cover" />
                  {selectedLogo === logo && !customLogoUrl && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customLogoUrl}
              onChange={(e) => setCustomLogoUrl(e.target.value)}
              placeholder="Or paste a custom image URL..."
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              Description (optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this product do, and who is it for?"
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none resize-none"
            />
          </div>

          {/* Live Preview Card */}
          {name.trim() && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 rounded-xl space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Preview
              </span>
              <div className="flex items-center gap-2.5">
                <img
                  src={customLogoUrl.trim() || selectedLogo}
                  alt={name}
                  className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {name}
                    </span>
                    <span className="text-[10px] text-zinc-400">• {category}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    {tagline || 'Product tagline'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !tagline.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 disabled:opacity-40 text-white dark:text-zinc-900 text-xs font-semibold rounded-lg transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Add Product</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
