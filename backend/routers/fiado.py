from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require
from lib.db import db
from lib.orders import adjust_balance, current_cash
from models.schemas import CustomerMove, FiadoCustomer, FiadoCustomerIn, ReceiveIn

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


@router.get("/customers/{id}/moves", response_model=list[CustomerMove])
async def customer_moves(id: str, _: dict = Depends(require("caixa"))):
    await get_customer(id)
    return await db.customer_moves.find({"customer_id": id}, {"_id": 0}).sort("at", -1).to_list(1000)


@router.post("/customers/{id}/receive", response_model=FiadoCustomer)
async def receive(id: str, body: ReceiveIn, user: dict = Depends(require("caixa"))):
    c = await get_customer(id)
    if body.amount > c["balance"] + 0.009:
        raise HTTPException(400, f"Valor maior que o saldo devedor (R$ {c['balance']:.2f})")
    if body.method in ("credito", "debito") and not body.brand:
        raise HTTPException(400, "Informe a bandeira do cartão (Visa, Mastercard ou Elo)")
    cash = await current_cash()
    if not cash:
        raise HTTPException(400, "Caixa fechado. Abra o caixa para receber pagamentos.")
    await adjust_balance(id, -body.amount)
    await db.customer_moves.insert_one(CustomerMove(
        customer_id=id, type="pagamento", amount=round(body.amount, 2), method=body.method,
        brand=body.brand if body.method in ("credito", "debito") else None, note=body.note,
        by_name=user["name"], cash_session_id=cash["id"]).model_dump())
    return await get_customer(id)
