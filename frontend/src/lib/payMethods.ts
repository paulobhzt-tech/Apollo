import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { registerPayLabels } from "@/lib/format";
import type { PaymentMethodCfg } from "@/lib/types";

export const usePayMethods = () =>
  useQuery({
    queryKey: ["payment-methods"],
    queryFn: async () => {
      const list = await apiGet<PaymentMethodCfg[]>("/payment-methods");
      registerPayLabels(list);
      return list;
    },
    staleTime: 60_000,
  });
