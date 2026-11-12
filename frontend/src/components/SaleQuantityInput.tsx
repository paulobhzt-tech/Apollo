import { Input } from "@/components/ui/input";
import { catalogNumber } from "@/lib/catalog-form";
import { toast } from "sonner";

/** Editors share the API's four-decimal limit for sales by weight or volume. */
export default function SaleQuantityInput({ qty, unit, onChange }: {
  qty: number;
  unit?: "un" | "kg" | "L";
  onChange: (qty: number) => void;
}) {
  if (unit !== "kg" && unit !== "L") return <span className="px-1 font-mono text-sm">{qty}</span>;
  return (
    <Input key={qty} aria-label={`Quantidade em ${unit}`} inputMode="decimal" defaultValue={String(qty).replace(".", ",")}
      className="h-7 w-20 font-mono" onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }} onBlur={(event) => {
        const value = catalogNumber(event.currentTarget.value);
        if (value === null || value <= 0 || value > 99 || Number(value.toFixed(4)) !== value) {
          event.currentTarget.value = String(qty).replace(".", ",");
          toast.error("Informe uma quantidade entre 0,0001 e 99, com até quatro casas decimais.");
          return;
        }
        event.currentTarget.value = String(value).replace(".", ",");
        onChange(value);
      }} />
  );
}
