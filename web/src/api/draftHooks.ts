import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteDraft, fetchDrafts, saveDraft, type DraftFields, type SavedDraft } from './drafts';

export const draftKeys = {
  list: (viewerId: string | null) => ['drafts', viewerId ?? 'anon'] as const,
};

export function useDrafts(viewerId: string | null, enabled = true) {
  return useQuery({ queryKey: draftKeys.list(viewerId), queryFn: fetchDrafts, enabled: Boolean(viewerId) && enabled, staleTime: 30_000 });
}

export function useSaveDraft(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string | null; fields: DraftFields }) => saveDraft(id, fields),
    onSettled: () => qc.invalidateQueries({ queryKey: draftKeys.list(viewerId) }),
  });
}

export function useDeleteDraft(viewerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDraft(id),
    onMutate: (id) => {
      qc.setQueryData<SavedDraft[]>(draftKeys.list(viewerId), (cur) => cur?.filter((d) => d.id !== id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: draftKeys.list(viewerId) }),
  });
}
