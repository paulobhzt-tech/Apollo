import hashlib

from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from fastapi import APIRouter, Depends, HTTPException

from lib.audit import audit_event
from lib.auth import require
from lib.db import db
from lib.orders import current_cash, validate_methods
from models.schemas import CustomerMove, FiadoCustomer, FiadoCustomerIn, OkOut, ReceiveIn

router = APIRouter()


async def get_customer(id: str) -> dict:
    c = await db.fiado_customers.find_one({"id": id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cliente não encontrado")
    return c


@router.get("/customers", response_model=list[FiadoCustomer])
async def list_customers(_: dict = Depends(require("caixa", "garcom"))):
    return await db.fiado_customers.find({}, {"_id": 0}).sort("name", 1).to_list(5000)


@router.post("/customers", response_model=FiadoCustomer)
async def create_customer(body: FiadoCustomerIn, _: dict = Depends(require("caixa"))):
    c = FiadoCustomer(**body.model_dump()).model_dump()
    await db.fiado_customers.insert_one(dict(c))
    return c


@router.put("/customers/{id}", response_model=FiadoCustomer)
async def update_customer(id: str, body: FiadoCustomerIn, _: dict = Depends(require("caixa"))):
    await get_customer(id)
    await db.fiado_customers.update_one({"id": id}, {"$set": body.model_dump()})
    return await get_customer(id)


@router.delete("/customers/{id}", response_model=OkOut)
async def delete_customer(id: str, _: dict = Depends(require("caixa"))):
    c = await get_customer(id)
    if c.get("balance", 0) > 0.009:
        raise HTTPException(400, f"{c['name']} ainda deve R$ {c['balance']:.2f}: receba o fiado antes de descadastrar")
    if c.get("fiado_journal") or await db.customer_moves.find_one({"customer_id": id}):
        raise HTTPException(409, "Cliente com histórico financeiro não pode ser excluído.")
    result = await db.fiado_customers.delete_one({"id": id, "balance": c["balance"], "fiado_journal": {"$exists": False}})
    if not result.deleted_count:
        raise HTTPException(409, "Cliente alterado durante o descadastro.")
    return OkOut(message="Cliente descadastrado")


async def publish_customer_move(move: dict):
    # The customer document commits the balance and the movement together.
    # This projection can be repeated after a lost response or a process restart.
    try:
        await db.customer_moves.update_one({"_id": move["id"]}, {"$setOnInsert": move}, upsert=True)
    except DuplicateKeyError:
        if not await db.customer_moves.find_one({"_id": move["id"]}):
            raise


@router.get("/customers/{id}/moves", response_model=list[CustomerMove])
async def customer_moves(id: str, _: dict = Depends(require("caixa"))):
    customer = await get_customer(id)
    rows = await db.customer_moves.find({"customer_id": id}, {"_id": 0}).sort([("at", -1), ("id", -1)]).to_list(1000)
    by_id = {row["id"]: row for row in rows}
    for record in customer.get("fiado_journal", {}).values():
        move = record["move"]
        by_id[move["id"]] = move
    rows = sorted(by_id.values(), key=lambda row: (row["at"], row["id"]), reverse=True)
    # Older entries lack an atomic snapshot. Reconstruct only when the
    # complete ledger reconciles with the stored balance.
    if len(rows) < 1000:
        balance = 0
        reconstructed = {}
        consistent = True
        for row in reversed(rows):
            balance += round(row["amount"] * 100) * (1 if row["type"] == "compra" else -1)
            if row.get("balance_after") is not None and round(row["balance_after"] * 100) != balance:
                consistent = False
            reconstructed[row["id"]] = balance / 100
        if consistent and balance == round(customer["balance"] * 100):
            for row in rows:
                row["balance_after"] = reconstructed[row["id"]]
    return rows[:1000]


async def record_customer_move(id, ref, fingerprint, user, build_move, *, reverse_id=None):
    key = hashlib.sha256(ref.encode()).hexdigest()
    field = f"fiado_journal.{key}"
    for _ in range(5):
        customer = await get_customer(id)
        saved = customer.get("fiado_journal", {}).get(key)
        if saved:
            if saved["fingerprint"] != fingerprint or saved["move"]["operator_id"] != user["id"]:
                raise HTTPException(409, "Referência já utilizada em outra operação.")
            await publish_customer_move(saved["move"])
            return await get_customer(id)
        move, delta = await build_move(customer)
        balance = round(customer["balance"] + delta, 2)
        move.update(id=f"fiado:{id}:{key}", operator_id=user["id"], balance_after=balance)
        conditions = {"id": id, "balance": customer["balance"], field: {"$exists": False}}
        changes = {"balance": balance, field: {"fingerprint": fingerprint, "move": move,
                   "audit": audit_event(f"fiado_{move['type']}", user, reason=move["note"],
                                        correlation=ref, values={"amount": move["amount"], "after_total": balance})}}
        if move["type"] == "compra":
            conditions["credit_limit"] = customer["credit_limit"]
        if reverse_id:
            reversal = f"fiado_reversals.{hashlib.sha256(reverse_id.encode()).hexdigest()}"
            if reversal.split(".")[1] in customer.get("fiado_reversals", {}):
                raise HTTPException(400, "Dívida já estornada.")
            conditions[reversal] = {"$exists": False}
            changes[reversal] = move["id"]
        updated = await db.fiado_customers.find_one_and_update(conditions, {"$set": changes},
                                                                return_document=ReturnDocument.AFTER)
        if updated:
            await publish_customer_move(move)
            return updated
    raise HTTPException(409, "Conta alterada por outro operador. Confira o extrato e tente novamente.")


@router.post("/customers/{id}/receive", response_model=FiadoCustomer)
async def receive(id: str, body: ReceiveIn, user: dict = Depends(require("caixa"))):
    async def build(customer):
        amount = round(body.amount, 2)
        if amount <= 0 or amount > customer["balance"]:
            raise HTTPException(400, "Informe um valor positivo dentro do saldo devedor.")
        if body.method in ("credito", "debito") and not body.brand:
            raise HTTPException(400, "Informe a bandeira do cartão.")
        await validate_methods([body.method])
        cash = await current_cash()
        if not cash:
            raise HTTPException(400, "Caixa fechado. Abra o caixa para receber pagamentos.")
        return CustomerMove(customer_id=id, type="pagamento", amount=amount, method=body.method,
                            brand=body.brand if body.method in ("credito", "debito") else None,
                            note=body.note, by_name=user["name"], cash_session_id=cash["id"]).model_dump(), -amount

    fingerprint = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    if not body.client_ref:
        raise HTTPException(422, "Atualize o Apollo para enviar a referência do recebimento.")
    return await record_customer_move(id, body.client_ref, fingerprint, user, build)


class DebtIn(BaseModel):
    client_ref: str = Field(min_length=1, max_length=128)
    amount: float = Field(gt=0, le=1_000_000)
    reason: str = Field(min_length=5, max_length=500)


class ReverseDebtIn(BaseModel):
    client_ref: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=5, max_length=500)


@router.post("/customers/{id}/debts", response_model=FiadoCustomer)
async def record_debt(id: str, body: DebtIn, user: dict = Depends(require())):
    async def build(customer):
        amount = round(body.amount, 2)
        if amount <= 0 or len(body.reason.strip()) < 5:
            raise HTTPException(400, "Informe valor e justificativa.")
        if customer["credit_limit"] and round(customer["balance"] + amount, 2) > customer["credit_limit"]:
            raise HTTPException(400, "A dívida excede o limite de crédito.")
        return CustomerMove(customer_id=id, type="compra", amount=amount, method="divida_manual",
                            note=body.reason.strip(), by_name=user["name"]).model_dump(), amount

    return await record_customer_move(id, body.client_ref, "debt:" + body.model_dump_json(), user, build)


@router.post("/customers/{id}/debts/{move_id}/reverse", response_model=FiadoCustomer)
async def reverse_debt(id: str, move_id: str, body: ReverseDebtIn, user: dict = Depends(require())):
    async def build(customer):
        source = next((record["move"] for record in customer.get("fiado_journal", {}).values()
                       if record["move"]["id"] == move_id and record["move"]["method"] == "divida_manual"), None)
        if not source:
            raise HTTPException(404, "Dívida manual não encontrada.")
        if len(body.reason.strip()) < 5:
            raise HTTPException(400, "Informe uma justificativa.")
        return CustomerMove(customer_id=id, type="estorno", amount=source["amount"], reverses_id=move_id,
                            note=body.reason.strip(), by_name=user["name"]).model_dump(), -source["amount"]

    return await record_customer_move(id, body.client_ref, "reverse:" + move_id + ":" + body.model_dump_json(),
                                      user, build, reverse_id=move_id)
