import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Environment } from "@/lib/types";

export const useEnvironments = () => useQuery({ queryKey: ["environments"], queryFn: () => apiGet<Environment[]>("/environments"), staleTime: 60_000 });

export const envName = (envs: Environment[] | undefined, key: string) => envs?.find((e) => e.key === key)?.name ?? key;
