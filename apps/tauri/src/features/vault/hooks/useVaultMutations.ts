import { useMemo } from "react";
import {
  type UseVaultCreateMutationsReturn,
  useVaultCreateMutations,
} from "./useVaultCreateMutations";
import {
  type UseVaultDeleteMutationsReturn,
  useVaultDeleteMutations,
} from "./useVaultDeleteMutations";

export type UseVaultMutationsReturn = UseVaultCreateMutationsReturn &
  UseVaultDeleteMutationsReturn & {
    error: string | null;
    isLoading: boolean;
  };

export function useVaultMutations(): UseVaultMutationsReturn {
  const create = useVaultCreateMutations();
  const del = useVaultDeleteMutations();

  return useMemo(
    () => ({
      ...create,
      ...del,
      error: del.error ?? create.error,
      isLoading: create.isLoading || del.isLoading,
    }),
    [create, del],
  );
}
