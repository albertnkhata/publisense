import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseLink } from '../lib/link';
import { fetchBoard, type Board } from './boards';
import { boardKeys } from './boardHooks';
import {
  checkProductLink,
  createBoard,
  decideBoard,
  fetchLinkPreview,
  fetchProductQueue,
  storeBoardLogo,
  type BoardDecision,
  type NewProduct,
} from './products';

/* TanStack Query hooks for Add a product (0024) and its admin queue. */

export const productKeys = {
  check: (key: string) => ['product-link', key] as const,
  preview: (key: string) => ['product-preview', key] as const,
  queue: (status: 'pending' | 'decided') => ['admin-products', status] as const,
};

/** The link's dedupe key, so "https://www.cursor.com/" and "cursor.com" share one lookup. */
const linkKey = (link: string) => {
  const p = parseLink(link);
  return p ? (p.kind === 'site' ? p.full : p.canonical) : '';
};

export function useLinkCheck(link: string, enabled = true) {
  const key = linkKey(link);
  return useQuery({
    queryKey: productKeys.check(key),
    queryFn: () => checkProductLink(link),
    enabled: enabled && Boolean(key),
    staleTime: 30_000,
    retry: false,
  });
}

export function useLinkPreview(link: string, enabled = true) {
  const p = parseLink(link);
  return useQuery({
    queryKey: productKeys.preview(p?.canonical ?? ''),
    queryFn: () => fetchLinkPreview(link),
    enabled: enabled && Boolean(p),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/**
 * Create the board, put it in the boards cache straight away (the composer opens on
 * it next), then ask link-preview to store its logo and refresh when that lands.
 */
export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: NewProduct) => {
      const created = await createBoard(p);
      const board = await fetchBoard(created.slug).catch(() => null);
      return { created, board };
    },
    onSuccess: ({ created, board }) => {
      if (board) {
        qc.setQueryData(boardKeys.board(board.slug), board);
        qc.setQueryData<Board[]>(boardKeys.boards, (list) => (list ? [...list.filter((b) => b.id !== board.id), board].sort((a, b) => a.name.localeCompare(b.name)) : list));
      }
      void qc.invalidateQueries({ queryKey: boardKeys.boards });
      void qc.invalidateQueries({ queryKey: boardKeys.follows(null).slice(0, 1) });
      void qc.invalidateQueries({ queryKey: ['product-link'] });
      void storeBoardLogo(created.id).then((path) => {
        if (!path) return;
        void qc.invalidateQueries({ queryKey: boardKeys.board(created.slug) });
        void qc.invalidateQueries({ queryKey: boardKeys.boards });
      });
    },
  });
}

export function useProductQueue(status: 'pending' | 'decided') {
  return useQuery({ queryKey: productKeys.queue(status), queryFn: () => fetchProductQueue(status) });
}

export function useDecideBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: BoardDecision) => decideBoard(d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
      void qc.invalidateQueries({ queryKey: boardKeys.boards });
      void qc.invalidateQueries({ queryKey: ['board'] });
      void qc.invalidateQueries({ queryKey: boardKeys.hubs });
    },
  });
}
