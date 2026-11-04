from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import COOKIE, SESSION_HOURS, create_session, current_user, hash_pin, require
from lib.db import db
from models.schemas import Employee, EmployeeIn, EmployeeUpdate, LoginIn, OkOut, Profile

router = APIRouter()


@router.get("/auth/profiles", response_model=list[Profile])
async def profiles():
    return await db.employees.find({"active": True}, {"_id": 0, "id": 1, "name": 1, "role": 1}).sort("name", 1).to_list(200)


@router.post("/auth/login", response_model=Employee)
async def login(body: LoginIn, response: Response):
    emp = await db.employees.find_one({"pin_hash": hash_pin(body.pin), "active": True}, {"_id": 0, "pin_hash": 0})
    if not emp:
        raise HTTPException(401, "PIN inválido")
    token = await create_session(emp["id"])
    response.set_cookie(COOKIE, token, httponly=True, secure=True, samesite="lax", max_age=SESSION_HOURS * 3600, path="/")
    return emp


@router.post("/auth/logout", response_model=OkOut)
async def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return OkOut()


@router.get("/auth/me", response_model=Employee)
async def me(user: dict = Depends(current_user)):
    return user


# ---------- employees (admin) ----------
async def _pin_free(pin: str, exclude_id: str | None = None) -> None:
    q: dict = {"pin_hash": hash_pin(pin)}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    if await db.employees.find_one(q):
        raise HTTPException(400, "Este PIN já está em uso por outro funcionário")


@router.get("/employees", response_model=list[Employee])
async def list_employees(_: dict = Depends(require())):
    return await db.employees.find({}, {"_id": 0, "pin_hash": 0}).sort("name", 1).to_list(500)


@router.post("/employees", response_model=Employee)
async def create_employee(body: EmployeeIn, _: dict = Depends(require())):
    await _pin_free(body.pin)
    data = body.model_dump()
    pin = data.pop("pin")
    emp = Employee(**data).model_dump()
    await db.employees.insert_one({**emp, "pin_hash": hash_pin(pin)})
    return emp


@router.put("/employees/{id}", response_model=Employee)
async def update_employee(id: str, body: EmployeeUpdate, user: dict = Depends(require())):
    data = body.model_dump(exclude_none=True)
    if "pin" in data:
        pin = data.pop("pin")
        await _pin_free(pin, id)
        data["pin_hash"] = hash_pin(pin)
    if id == user["id"] and (data.get("active") is False or data.get("role", "admin") != "admin"):
        raise HTTPException(400, "Você não pode desativar ou rebaixar seu próprio usuário")
    res = await db.employees.find_one_and_update({"id": id}, {"$set": data}, projection={"_id": 0, "pin_hash": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Funcionário não encontrado")
    return res


@router.delete("/employees/{id}", response_model=OkOut)
async def delete_employee(id: str, user: dict = Depends(require())):
    if id == user["id"]:
        raise HTTPException(400, "Você não pode excluir seu próprio usuário")
    res = await db.employees.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "Funcionário não encontrado")
    await db.sessions.delete_many({"employee_id": id})
    return OkOut()
