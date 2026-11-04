// Hand-written mirrors of backend/models/schemas.py — keep in sync.
export type Role = "admin" | "caixa" | "garcom" | "cozinha";
export type Station = string; // environment key (ambiente de produção)
export interface Environment { id: string; key: string; name: string; auto_print: boolean; sort: number }
export type EnvironmentIn = Omit<Environment, "id" | "key">;
export type Unit = "kg" | "g" | "L" | "ml" | "un";
export type PayMethod = "dinheiro" | "credito" | "debito" | "pix" | "voucher" | "fiado" | "online";
export type Source = "pdv" | "mesa" | "cardapio" | "ifood" | "99food" | "keeta" | "site";
export type DeliveryStatus = "pendente" | "aceito" | "preparo" | "saiu" | "entregue" | "recusado";

export interface Employee {
  id: string;
  name: string;
  role: Role;
  phone: string;
  commission_pct: number;
  can_cancel: boolean;
  active: boolean;
  created_at: string;
}
export interface EmployeeIn {
  name: string;
  role: Role;
  phone: string;
  commission_pct: number;
  pin?: string;
  can_cancel: boolean;
  active: boolean;
}
export interface Profile { id: string; name: string; role: Role }

export interface Category { id: string; name: string; station: Station; sort: number }
export type CategoryIn = Omit<Category, "id">;
export interface OptionChoice { name: string; price: number; product_id?: string | null }
export interface OptionGroup { name: string; required: boolean; multi: boolean; choices: OptionChoice[] }
export interface ChosenOption { group: string; name: string }
export interface RecipeItem { ingredient_id: string; qty: number }
export interface Product {
  id: string;
  name: string;
  description: string;
  category_id: string;
  price: number;
  code: string;
  image: string;
  active: boolean;
  recipe: RecipeItem[];
  cost_price: number;
  options: OptionGroup[];
  station: string; // "" = environment of the category
  print_ticket: boolean;
  cost: number;
  margin_pct: number;
}
export type ProductIn = Omit<Product, "id" | "cost" | "margin_pct">;

export interface Ingredient {
  id: string;
  name: string;
  unit: Unit;
  stock: number;
  min_stock: number;
  cost_per_unit: number;
  updated_at: string;
}
export type IngredientIn = Omit<Ingredient, "id" | "updated_at">;
export interface StockMove {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  type: "entrada" | "saida" | "ajuste" | "venda" | "estorno";
  qty: number;
  note: string;
  by_name: string;
  created_at: string;
}

export interface Customer { name: string; phone: string; address: string; cpf: string }
export interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  notes: string;
  station: Station;
  options: string[];
  option_products: string[];
  print_ticket: boolean;
  cancelled: boolean;
  cancel_reason: string;
}
export interface OrderItemIn { product_id: string; qty: number; notes: string; options?: ChosenOption[] }
export type CardBrand = "visa" | "mastercard" | "elo";
export interface Payment { method: PayMethod; amount: number; brand?: CardBrand | null }
export interface Refund { item_name: string; amount: number; method: string; brand: string | null; reason: string; by_name: string; at: string }
export interface Order {
  id: string;
  number: number;
  channel: "balcao" | "mesa" | "delivery";
  source: Source;
  table_id: string | null;
  table_number: number | null;
  table_label: string;
  customer: Customer;
  items: OrderItem[];
  status: "aberto" | "pago" | "cancelado";
  delivery_status: DeliveryStatus | null;
  subtotal: number;
  discount: number;
  service_fee: number;
  delivery_fee: number;
  total: number;
  payments: Payment[];
  change: number;
  pay_on_delivery: string | null;
  marketplace_fee: number;
  cmv: number;
  waiter_id: string | null;
  waiter_name: string;
  cash_session_id: string | null;
  invoice_id: string | null;
  client_ref: string | null;
  created_at: string;
  paid_at: string | null;
  refunds: Refund[];
  fiado_customer_id: string | null;
  refunded_total: number;
  cancel_reason: string;
  cancelled_by: string;
  cancelled_at: string | null;
}
export interface PayIn {
  payments: Payment[];
  discount: number;
  service_pct: number;
  emit_invoice: boolean;
  doc_type: "nfce" | "nfe";
  customer_cpf: string;
  fiado_customer_id?: string | null;
}
export interface QuickSaleIn extends PayIn {
  client_ref: string;
  items: OrderItemIn[];
  customer_name: string;
  send_to_kitchen: boolean;
}
export interface SaleResult { order: Order; invoice: Invoice | null }

export interface KitchenItem { name: string; qty: number; notes: string; station: Station; options: string[]; print_ticket: boolean }
export interface KitchenTicket {
  id: string;
  order_id: string;
  order_number: number;
  label: string;
  source: Source;
  items: KitchenItem[];
  status: "novo" | "preparo" | "pronto" | "entregue";
  printed: string[];
  created_at: string;
  updated_at: string;
}

export interface Table {
  id: string;
  number: number;
  kind: "mesa" | "comanda";
  name: string;
  seats: number;
  status: "livre" | "ocupada" | "conta" | "reservada";
  customer_name: string;
  people: number;
  waiter_id: string | null;
  waiter_name: string;
  order_id: string | null;
  opened_at: string | null;
  call: "" | "garcom" | "conta";
  total: number;
}

export interface InvoiceItem { name: string; qty: number; unit_price: number }
export interface Invoice {
  id: string;
  number: number;
  series: number;
  doc_type: "nfce" | "nfe";
  access_key: string;
  protocol: string;
  status: "autorizada" | "cancelada";
  order_id: string;
  order_number: number;
  total: number;
  items: InvoiceItem[];
  payments: Payment[];
  customer_cpf: string;
  emitted_at: string;
}

export interface CashMovement { type: "sangria" | "suprimento"; amount: number; note: string; by_name: string; at: string }
export interface CashSession {
  id: string;
  opened_by_name: string;
  opened_at: string;
  opening_amount: number;
  status: "aberto" | "fechado";
  closed_at: string | null;
  closed_by_name: string;
  counted_amount: number | null;
  expected_cash: number;
  difference: number;
  movements: CashMovement[];
  totals_by_method: Record<string, number>;
  sales_count: number;
  sales_total: number;
}

export type ExpenseCat = "aluguel" | "salarios" | "energia" | "agua" | "marketing" | "manutencao" | "impostos" | "outros";
export interface Expense { id: string; description: string; category: ExpenseCat; amount: number; date: string; created_at: string }
export interface NamedValue { name: string; value: number }
export interface TopProduct { name: string; qty: number; revenue: number }
export interface Dashboard {
  date: string;
  revenue_today: number;
  orders_today: number;
  avg_ticket: number;
  open_tables: number;
  total_tables: number;
  kitchen_pending: number;
  delivery_pending: number;
  low_stock: Ingredient[];
  sales_by_hour: NamedValue[];
  by_payment: NamedValue[];
  by_channel: NamedValue[];
  top_products: TopProduct[];
  last7: NamedValue[];
  cash_open: boolean;
}
export interface Commission { employee_id: string; name: string; sales: number; pct: number; commission: number }
export interface Dre {
  start: string;
  end: string;
  gross_revenue: number;
  discounts: number;
  marketplace_fees: number;
  card_fees: number;
  taxes: number;
  net_revenue: number;
  cmv: number;
  gross_profit: number;
  commissions: number;
  expenses: number;
  expenses_by_category: NamedValue[];
  net_profit: number;
  margin_pct: number;
  orders: number;
  by_payment: NamedValue[];
  by_source: NamedValue[];
  daily: NamedValue[];
  top_products: TopProduct[];
  commission_list: Commission[];
}

export interface PublicMenu { restaurant: string; categories: Category[]; products: Product[] }
export interface PublicDeliveryIn {
  items: OrderItemIn[];
  customer: Customer;
  payment_method: "dinheiro" | "credito" | "debito" | "pix";
  change_for: number;
}
export interface PublicTable { id: string; number: number; label: string; status: string; total: number }
export interface TableIn { number: number; kind: "mesa" | "comanda"; name: string; seats: number }
export interface PublicOrderStatus {
  id: string;
  number: number;
  delivery_status: string | null;
  total: number;
  items: OrderItem[];
  created_at: string;
}
export interface FiadoCustomer { id: string; name: string; phone: string; cpf: string; credit_limit: number; balance: number; created_at: string }
export type FiadoCustomerIn = Pick<FiadoCustomer, "name" | "phone" | "cpf" | "credit_limit">;
export interface CustomerMove {
  id: string; customer_id: string; type: "compra" | "pagamento" | "estorno"; amount: number; order_number: number | null;
  method: string; brand: string | null; note: string; by_name: string; cash_session_id: string | null; at: string;
}
export interface CardFees { fees: Record<string, number> }
export type PrinterPurpose = string; // "caixa" or an environment key
export interface Printer { id: string; name: string; purpose: PrinterPurpose; paper: "58mm" | "80mm" | "A4"; ip: string; copies: number; active: boolean }
export type PrinterIn = Omit<Printer, "id">;
export interface GeneralSettings { company_name: string; trade_name: string; cnpj: string; ie: string; city: string; receipt_footer: string; pix_key: string; pix_holder: string; phone: string; address: string }
export interface OptionRank { group: string; name: string; qty: number; products: string[] }
export interface RestoreIn { data: Record<string, unknown[]> }
export interface RestoreOut { ok: boolean; counts: Record<string, number>; message: string }
export interface OkOut { ok: boolean; message: string }
export interface DriveBackupInfo { at: string | null; ok: boolean; file_name: string; size_kb: number; trigger: string; error: string }
export interface DriveStatus { configured: boolean; connected: boolean; email: string; auto: boolean; folder_name: string; last: DriveBackupInfo | null; history: DriveBackupInfo[] }
export interface DriveSettingsIn { auto: boolean }
export interface AuthUrlOut { authorization_url: string }
export type SelfTestStatus = "ok" | "aviso" | "falha";
export interface SelfTestCheck { key: string; label: string; status: SelfTestStatus; detail: string; fix: string }
export interface SelfTestResult { at: string; by_name: string; ok: number; warnings: number; failures: number; checks: SelfTestCheck[] }
