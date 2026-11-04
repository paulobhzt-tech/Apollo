"""All Pydantic v2 models. Mirrored by hand in frontend/src/lib/types.ts — keep in sync."""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


Role = Literal["admin", "caixa", "garcom", "cozinha"]
Station = str  # key of an Environment (ambiente de produção), e.g. "cozinha", "churrasqueira"
Unit = Literal["kg", "g", "L", "ml", "un"]
PayMethod = Literal["dinheiro", "credito", "debito", "pix", "voucher", "fiado", "online"]
Source = Literal["pdv", "mesa", "cardapio", "ifood", "99food", "keeta", "site"]


# ---------- auth / employees ----------
class Employee(BaseModel):
    id: str = Field(default_factory=_id)
    name: str
    role: Role
    phone: str = ""
    commission_pct: float = 0
    can_cancel: bool = False
    active: bool = True
    created_at: datetime = Field(default_factory=_now)


class EmployeeIn(BaseModel):
    name: str = Field(min_length=2)
    role: Role
    phone: str = ""
    commission_pct: float = Field(default=0, ge=0, le=100)
    pin: str = Field(pattern=r"^\d{4,6}$")
    can_cancel: bool = False
    active: bool = True


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2)
    role: Optional[Role] = None
    phone: Optional[str] = None
    commission_pct: Optional[float] = Field(default=None, ge=0, le=100)
    pin: Optional[str] = Field(default=None, pattern=r"^\d{4,6}$")
    active: Optional[bool] = None
    can_cancel: Optional[bool] = None


class LoginIn(BaseModel):
    pin: str = Field(pattern=r"^\d{4,6}$")


class Profile(BaseModel):
    id: str
    name: str
    role: Role


# ---------- catalog ----------
class Category(BaseModel):
    id: str = Field(default_factory=_id)
    name: str
    station: Station = "cozinha"
    sort: int = 0


class Environment(BaseModel):
    """Ambiente de produção (cozinha, churrasqueira, bar…). Tickets are split and printed per environment."""
    id: str = Field(default_factory=_id)
    key: str
    name: str
    auto_print: bool = True
    sort: int = 0


class EnvironmentIn(BaseModel):
    name: str = Field(min_length=2)
    auto_print: bool = True
    sort: int = 0


class CategoryIn(BaseModel):
    name: str = Field(min_length=1)
    station: Station = "cozinha"
    sort: int = 0


class RecipeItem(BaseModel):
    ingredient_id: str
    qty: float = Field(gt=0)


class OptionChoice(BaseModel):
    name: str = Field(min_length=1)
    price: float = Field(default=0, ge=0)
    product_id: Optional[str] = None  # combo choice linked to a real product (stock + cost)


class OptionGroup(BaseModel):
    name: str = Field(min_length=1)
    required: bool = False
    multi: bool = False
    choices: list[OptionChoice] = Field(min_length=1)


class ChosenOption(BaseModel):
    group: str
    name: str


class Product(BaseModel):
    id: str = Field(default_factory=_id)
    name: str
    description: str = ""
    category_id: str
    price: float
    code: str = ""
    image: str = ""
    active: bool = True
    recipe: list[RecipeItem] = []
    cost_price: float = 0  # manual cost; when > 0 it overrides the recipe cost
    options: list[OptionGroup] = []
    station: str = ""  # empty = environment of the category
    print_ticket: bool = True
    cost: float = 0
    margin_pct: float = 0


class ProductIn(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    category_id: str
    price: float = Field(ge=0)
    code: str = ""
    image: str = ""
    active: bool = True
    recipe: list[RecipeItem] = []
    cost_price: float = Field(default=0, ge=0)
    options: list[OptionGroup] = []
    station: str = ""
    print_ticket: bool = True


# ---------- stock ----------
class Ingredient(BaseModel):
    id: str = Field(default_factory=_id)
    name: str
    unit: Unit
    stock: float = 0
    min_stock: float = 0
    cost_per_unit: float = 0
    updated_at: datetime = Field(default_factory=_now)


class IngredientIn(BaseModel):
    name: str = Field(min_length=1)
    unit: Unit
    stock: float = 0
    min_stock: float = Field(default=0, ge=0)
    cost_per_unit: float = Field(default=0, ge=0)


class StockMoveIn(BaseModel):
    ingredient_id: str
    type: Literal["entrada", "saida", "ajuste"]
    qty: float
    note: str = ""


class StockMove(BaseModel):
    id: str = Field(default_factory=_id)
    ingredient_id: str
    ingredient_name: str
    type: Literal["entrada", "saida", "ajuste", "venda", "estorno"]
    qty: float
    note: str = ""
    by_name: str = ""
    created_at: datetime = Field(default_factory=_now)


# ---------- orders ----------
class Customer(BaseModel):
    name: str = ""
    phone: str = ""
    address: str = ""
    cpf: str = ""


class OrderItem(BaseModel):
    id: str = Field(default_factory=_id)
    product_id: str
    name: str
    qty: int
    unit_price: float
    unit_cost: float = 0
    notes: str = ""
    station: Station = "cozinha"
    options: list[str] = []
    option_products: list[str] = []
    print_ticket: bool = True
    cancelled: bool = False
    cancel_reason: str = ""


class OrderItemIn(BaseModel):
    product_id: str
    qty: int = Field(ge=1, le=99)
    notes: str = ""
    options: list[ChosenOption] = []


CardBrand = Literal["visa", "mastercard", "elo"]


class Payment(BaseModel):
    method: PayMethod
    amount: float = Field(gt=0)
    brand: Optional[CardBrand] = None


class Refund(BaseModel):
    item_name: str
    amount: float
    method: str
    brand: Optional[str] = None
    reason: str
    by_name: str
    at: datetime = Field(default_factory=_now)


class Order(BaseModel):
    id: str = Field(default_factory=_id)
    number: int
    channel: Literal["balcao", "mesa", "delivery"]
    source: Source
    table_id: Optional[str] = None
    table_number: Optional[int] = None
    table_label: str = ""
    customer: Customer = Customer()
    items: list[OrderItem] = []
    status: Literal["aberto", "pago", "cancelado"] = "aberto"
    delivery_status: Optional[Literal["pendente", "aceito", "preparo", "saiu", "entregue", "recusado"]] = None
    subtotal: float = 0
    discount: float = 0
    service_fee: float = 0
    delivery_fee: float = 0
    total: float = 0
    payments: list[Payment] = []
    change: float = 0
    pay_on_delivery: Optional[str] = None
    marketplace_fee: float = 0
    cmv: float = 0
    waiter_id: Optional[str] = None
    waiter_name: str = ""
    cash_session_id: Optional[str] = None
    invoice_id: Optional[str] = None
    client_ref: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
    paid_at: Optional[datetime] = None
    refunds: list[Refund] = []
    fiado_customer_id: Optional[str] = None
    refunded_total: float = 0
    cancel_reason: str = ""
    cancelled_by: str = ""
    cancelled_at: Optional[datetime] = None


class PayIn(BaseModel):
    payments: list[Payment] = Field(min_length=1)
    discount: float = Field(default=0, ge=0)
    service_pct: float = Field(default=0, ge=0, le=20)
    emit_invoice: bool = True
    doc_type: Literal["nfce", "nfe"] = "nfce"
    customer_cpf: str = ""
    fiado_customer_id: Optional[str] = None


class QuickSaleIn(PayIn):
    client_ref: str = Field(min_length=6)
    items: list[OrderItemIn] = Field(min_length=1)
    customer_name: str = ""
    send_to_kitchen: bool = True


class SaleResult(BaseModel):
    order: Order
    invoice: Optional["Invoice"] = None


class CancelIn(BaseModel):
    reason: str = Field(min_length=3)
    manager_pin: Optional[str] = None
    qty: Optional[float] = Field(default=None, gt=0)  # table items: remove only part of the quantity


# ---------- kitchen ----------
class KitchenItem(BaseModel):
    name: str
    qty: int
    notes: str = ""
    station: Station = "cozinha"
    options: list[str] = []
    print_ticket: bool = True


class KitchenTicket(BaseModel):
    id: str = Field(default_factory=_id)
    order_id: str
    order_number: int
    label: str
    source: Source
    items: list[KitchenItem]
    status: Literal["novo", "preparo", "pronto", "entregue"] = "novo"
    printed: list[str] = []  # environment keys already printed
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class TicketPrintedIn(BaseModel):
    station: str = Field(min_length=1)


class TicketStatusIn(BaseModel):
    status: Literal["novo", "preparo", "pronto", "entregue"]


# ---------- tables ----------
TableKind = Literal["mesa", "comanda"]


def table_label(t: dict) -> str:
    base = f"{'Comanda' if t.get('kind') == 'comanda' else 'Mesa'} {t['number']}"
    return f"{base} · {t['name']}" if t.get("name") else base


class Table(BaseModel):
    id: str = Field(default_factory=_id)
    number: int
    kind: TableKind = "mesa"
    name: str = ""
    seats: int = 4
    status: Literal["livre", "ocupada", "conta", "reservada"] = "livre"
    customer_name: str = ""
    people: int = 0
    waiter_id: Optional[str] = None
    waiter_name: str = ""
    order_id: Optional[str] = None
    opened_at: Optional[datetime] = None
    call: Literal["", "garcom", "conta"] = ""
    total: float = 0


class TableIn(BaseModel):
    number: int = Field(ge=1)
    kind: TableKind = "mesa"
    name: str = Field(default="", max_length=40)
    seats: int = Field(default=4, ge=1)


class TableUpdate(BaseModel):
    name: str = Field(default="", max_length=40)
    seats: int = Field(default=4, ge=1)


class OpenTableIn(BaseModel):
    people: int = Field(default=1, ge=1)
    customer_name: str = ""


class AddItemsIn(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1)


class TransferIn(BaseModel):
    target_table_id: str


class TableStatusIn(BaseModel):
    status: Literal["livre", "ocupada", "reservada", "conta"]


# ---------- invoices ----------
class InvoiceItem(BaseModel):
    name: str
    qty: int
    unit_price: float


class Invoice(BaseModel):
    id: str = Field(default_factory=_id)
    number: int
    series: int = 1
    doc_type: Literal["nfce", "nfe"]
    access_key: str
    protocol: str
    status: Literal["autorizada", "cancelada"] = "autorizada"
    order_id: str
    order_number: int
    total: float
    items: list[InvoiceItem]
    payments: list[Payment]
    customer_cpf: str = ""
    emitted_at: datetime = Field(default_factory=_now)


class EmitInvoiceIn(BaseModel):
    doc_type: Literal["nfce", "nfe"] = "nfce"
    customer_cpf: str = ""


# ---------- cash ----------
class CashMovement(BaseModel):
    type: Literal["sangria", "suprimento"]
    amount: float
    note: str = ""
    by_name: str = ""
    at: datetime = Field(default_factory=_now)


class CashSession(BaseModel):
    id: str = Field(default_factory=_id)
    opened_by_name: str
    opened_at: datetime = Field(default_factory=_now)
    opening_amount: float
    status: Literal["aberto", "fechado"] = "aberto"
    closed_at: Optional[datetime] = None
    closed_by_name: str = ""
    counted_amount: Optional[float] = None
    expected_cash: float = 0
    difference: float = 0
    movements: list[CashMovement] = []
    totals_by_method: dict[str, float] = {}
    sales_count: int = 0
    sales_total: float = 0


class CashOpenIn(BaseModel):
    opening_amount: float = Field(ge=0)


class CashMoveIn(BaseModel):
    type: Literal["sangria", "suprimento"]
    amount: float = Field(gt=0)
    note: str = ""


class CashCloseIn(BaseModel):
    counted_amount: float = Field(ge=0)


# ---------- finance ----------
ExpenseCat = Literal["aluguel", "salarios", "energia", "agua", "marketing", "manutencao", "impostos", "outros"]


class Expense(BaseModel):
    id: str = Field(default_factory=_id)
    description: str
    category: ExpenseCat
    amount: float
    date: str
    created_at: datetime = Field(default_factory=_now)


class ExpenseIn(BaseModel):
    description: str = Field(min_length=2)
    category: ExpenseCat
    amount: float = Field(gt=0)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class NamedValue(BaseModel):
    name: str
    value: float


class TopProduct(BaseModel):
    name: str
    qty: int
    revenue: float


class Dashboard(BaseModel):
    date: str
    revenue_today: float
    orders_today: int
    avg_ticket: float
    open_tables: int
    total_tables: int
    kitchen_pending: int
    delivery_pending: int
    low_stock: list[Ingredient]
    sales_by_hour: list[NamedValue]
    by_payment: list[NamedValue]
    by_channel: list[NamedValue]
    top_products: list[TopProduct]
    last7: list[NamedValue]
    cash_open: bool


class Commission(BaseModel):
    employee_id: str
    name: str
    sales: float
    pct: float
    commission: float


class Dre(BaseModel):
    start: str
    end: str
    gross_revenue: float
    discounts: float
    marketplace_fees: float
    card_fees: float
    taxes: float
    net_revenue: float
    cmv: float
    gross_profit: float
    commissions: float
    expenses: float
    expenses_by_category: list[NamedValue]
    net_profit: float
    margin_pct: float
    orders: int
    by_payment: list[NamedValue]
    by_source: list[NamedValue]
    daily: list[NamedValue]
    top_products: list[TopProduct]
    commission_list: list[Commission]


# ---------- delivery / public ----------
class DeliveryStatusIn(BaseModel):
    status: Literal["aceito", "preparo", "saiu", "entregue", "recusado"]


class SimulateIn(BaseModel):
    source: Literal["ifood", "99food", "keeta", "site"]


class PublicOrderIn(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1)


class PublicDeliveryIn(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1)
    customer: Customer
    payment_method: Literal["dinheiro", "credito", "debito", "pix"]
    change_for: float = Field(default=0, ge=0)


class CallIn(BaseModel):
    type: Literal["garcom", "conta"]


class PublicMenu(BaseModel):
    restaurant: str
    categories: list[Category]
    products: list[Product]


class PublicTable(BaseModel):
    id: str
    number: int
    label: str = ""
    status: str
    total: float


class PublicOrderStatus(BaseModel):
    id: str
    number: int
    delivery_status: Optional[str]
    total: float
    items: list[OrderItem]
    created_at: datetime


class FiadoCustomer(BaseModel):
    id: str = Field(default_factory=_id)
    name: str
    phone: str = ""
    cpf: str = ""
    credit_limit: float = 0
    balance: float = 0
    created_at: datetime = Field(default_factory=_now)


class FiadoCustomerIn(BaseModel):
    name: str = Field(min_length=2)
    phone: str = ""
    cpf: str = ""
    credit_limit: float = Field(default=0, ge=0)


class CustomerMove(BaseModel):
    id: str = Field(default_factory=_id)
    customer_id: str
    type: Literal["compra", "pagamento", "estorno"]
    amount: float
    order_number: Optional[int] = None
    method: str = ""
    brand: Optional[str] = None
    note: str = ""
    by_name: str = ""
    cash_session_id: Optional[str] = None
    at: datetime = Field(default_factory=_now)


class ReceiveIn(BaseModel):
    amount: float = Field(gt=0)
    method: Literal["dinheiro", "credito", "debito", "pix"]
    brand: Optional[CardBrand] = None
    note: str = ""


class CardFees(BaseModel):
    fees: dict[str, float] = {}


class Printer(BaseModel):
    id: str = Field(default_factory=_id)
    name: str
    purpose: str = "caixa"  # "caixa" or an environment key
    paper: Literal["58mm", "80mm", "A4"] = "80mm"
    ip: str = ""
    copies: int = 1
    active: bool = True


class PrinterIn(BaseModel):
    name: str = Field(min_length=2)
    purpose: str = "caixa"  # "caixa" or an environment key
    paper: Literal["58mm", "80mm", "A4"] = "80mm"
    ip: str = ""
    copies: int = Field(default=1, ge=1, le=5)
    active: bool = True


class GeneralSettings(BaseModel):
    company_name: str = ""  # razão social
    trade_name: str = ""  # nome fantasia
    cnpj: str = ""
    ie: str = ""
    city: str = ""
    receipt_footer: str = ""
    pix_key: str = ""
    pix_holder: str = ""
    phone: str = ""
    address: str = ""


class OptionRank(BaseModel):
    group: str
    name: str
    qty: int
    products: list[str]


class RestoreIn(BaseModel):
    data: dict[str, list[dict]]


class RestoreOut(BaseModel):
    ok: bool = True
    counts: dict[str, int] = {}
    message: str = ""


class DriveBackupInfo(BaseModel):
    at: Optional[datetime] = None
    ok: bool = False
    file_name: str = ""
    size_kb: int = 0
    trigger: str = ""  # "manual" | "automatico"
    error: str = ""


class DriveStatus(BaseModel):
    configured: bool  # Google credentials present on the server
    connected: bool
    email: str = ""
    auto: bool = True
    folder_name: str = "Backups Espeteria"
    last: Optional[DriveBackupInfo] = None
    history: list[DriveBackupInfo] = []


class DriveSettingsIn(BaseModel):
    auto: bool


class AuthUrlOut(BaseModel):
    authorization_url: str


class SelfTestCheck(BaseModel):
    key: str
    label: str
    status: Literal["ok", "aviso", "falha"]
    detail: str = ""
    fix: str = ""  # where to fix it in the app


class SelfTestResult(BaseModel):
    at: datetime
    by_name: str = ""
    ok: int
    warnings: int
    failures: int
    checks: list[SelfTestCheck]


class OkOut(BaseModel):
    ok: bool = True
    message: str = ""


SaleResult.model_rebuild()
