import { Input } from "@/components/ui/input";
import { catalogNumber } from "@/lib/catalog-form";
import { toast } from "sonner";

/** Editors share the API's four-decimal limit for sales by weight or volume. */
export default function SaleQuantityInput({ qty, unit, onChange }: {
  qty: number;
  unit?: "un" | "kg" | "L";
  onChange: (qty: number) => void;
}) {
  const fractional = unit === "kg" || unit === "L";
  return (
    <Input key={qty} aria-label={`Quantidade em ${unit ?? "un"}`} inputMode={fractional ? "decimal" : "numeric"} defaultValue={String(qty).replace(".", ",")}
      className="h-7 w-20 font-mono" onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }} onBlur={(event) => {
        const value = catalogNumber(event.currentTarget.value);
        if (value === null || value <= 0 || value > 99 || (fractional ? Number(value.toFixed(4)) !== value : !Number.isInteger(value))) {
          event.currentTarget.value = String(qty).replace(".", ",");
          toast.error(fractional
            ? "Informe uma quantidade entre 0,0001 e 99, com até quatro casas decimais."
            : "Informe uma quantidade inteira entre 1 e 99.");
          return;
        }
        event.currentTarget.value = String(value).replace(".", ",");
        if (value !== qty) onChange(value);
      }} />
  );
}
