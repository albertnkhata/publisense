import React from 'react';
import { 
  X
} from 'lucide-react';

interface StrategyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StrategyDrawer: React.FC<StrategyDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/60 backdrop-blur-xs flex justify-end transition-all">
      <div 
        className="w-full max-w-xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 h-full min-h-screen p-6 sm:p-8 overflow-y-auto space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Internal Strategy Memo
            </span>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mt-0.5">
              Product Analysis &amp; Mechanics
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: Executive Verdict */}
        <div className="space-y-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            1. Core Validation
          </h3>
          <p>
            The brainstorm conversation correctly identified that scattered Twitter rants fail both sides: users get no resolution, and product teams get noisy, irreproducible complaints. Centralizing feedback into a structured home turns chaotic complaint threads into measurable demand.
          </p>
          <p>
            Starting narrowly with <strong>AI Developer &amp; Consumer Tools</strong> (ChatGPT, Cursor, Claude, Midjourney) avoids the cold start trap. In fast-moving AI spaces, users are active and vocal, and bug workarounds are invaluable.
          </p>
        </div>

        {/* Section 2: Voting & Repost Mechanics */}
        <div className="space-y-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            2. The Voting Taxonomy
          </h3>
          <ul className="space-y-2 pl-3 border-l border-zinc-200 dark:border-zinc-800">
            <li>
              <strong>Product Hunt-Style Upvote (+1):</strong> Primary ranking signal. Clear, single-direction signal showing collective demand and affected user headcount, without vanity metrics.
            </li>
            <li>
              <strong>No Downvotes:</strong> Downvotes introduce negative ambiguity ("I don't need this" vs "This is wrong" vs "I dislike the OP"). Dissenting opinions belong in comments.
            </li>
            <li>
              <strong>Separate Share Action:</strong> Sharing to X rallies external users without artificially polluting internal vote weights.
            </li>
          </ul>
        </div>

        {/* Section 3: Duplicate Signal Clustering */}
        <div className="space-y-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            3. Anti-Fragmentation (Duplicate Detection)
          </h3>
          <p>
            When 15 people post variations of the same issue, signal fragments into 15 small posts that product managers ignore. Our inline duplicate scanner catches similar titles in real time, encouraging users to back existing items.
          </p>
        </div>

        {/* Section 4: Closed-Loop Company Incentive */}
        <div className="space-y-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            4. Why Companies Will Participate
          </h3>
          <p>
            The Radar score (responsiveness rate) creates public accountability. When product teams change status to "Planned" or "Shipped", all backing users are notified, turning dissatisfied complainers into loyal brand champions.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
