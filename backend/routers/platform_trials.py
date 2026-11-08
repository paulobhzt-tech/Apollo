"""Manual trial activation for explicitly provisioned platform operators.

This is not a public self-service endpoint. A platform superadmin must have
verified the customer identity out of band. Private signing keys are server-only.
"""
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from lib.auth import current_user
from lib.db import db
from lib.trial_issuance import issue_trial, TrialConflict, evaluate_trial
from lib.trial_signing import sign_trial_license
from lib.license_verification import LicenseError

router = APIRouter(prefix="/commercial/platform/trials", tags=["platform-trials"])


async def platform_operator(user: dict = Depends(current_user)) -> dict:
    # Restaurant admins are not SaaS platform administrators.
    if user.get("platform_role") != "superadmin" or user.get("role") != "admin":
        raise HTTPException(403, "Operação restrita à administração da plataforma")
    return user


class ManualTrialRequest(BaseModel):
    verified_customer_id: str = Field(min_length=3, max_length=128)
    installation_id: str = Field(min_length=8, max_length=256)


@router.post("/issue")
async def activate_trial(body: ManualTrialRequest, operator: dict = Depends(platform_operator)):
    key = os.environ.get("APOLLO_LICENSE_PRIVATE_KEY", "")
    if not key:
        raise HTTPException(503, "Assinatura de licenças não configurada")
    now = datetime.now(timezone.utc)
    try:
        record = await issue_trial(
            db.commercial_trials, verified_customer_id=body.verified_customer_id,
            installation_id=body.installation_id, now=now,
        )
        signed = sign_trial_license(record, key, now=now)
    except TrialConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except (ValueError, LicenseError) as exc:
        raise HTTPException(422, str(exc)) from exc
    # Never return or log the signing key.
    return {"license": signed, "created": record["created"],
            "trial": evaluate_trial(record, now=now)}


@router.get("/{customer_id}/status")
async def trial_status_for_operator(customer_id: str, _: dict = Depends(platform_operator)):
    record = await db.commercial_trials.find_one({"_id": customer_id})
    if not record:
        raise HTTPException(404, "Teste não encontrado")
    return evaluate_trial(record)
