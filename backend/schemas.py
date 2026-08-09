"""Pydantic request models -- backend validation for all financial-data edits.

Rules: no negative money, CIBIL within the supported band, valid ISO dates,
positive transaction/bill amounts, non-empty labels. Errors surface as 422 with
field detail, which the UI renders inline.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

CIBIL_MIN, CIBIL_MAX = 300, 900


def _valid_date(v: str) -> str:
    try:
        datetime.strptime(v, "%Y-%m-%d")
    except (ValueError, TypeError):
        raise ValueError("date must be ISO format YYYY-MM-DD")
    return v


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    monthly_income: float | None = Field(default=None, ge=0)
    savings_balance: float | None = Field(default=None, ge=0)
    emergency_fund: float | None = Field(default=None, ge=0)
    credit_score: int | None = Field(default=None, ge=CIBIL_MIN, le=CIBIL_MAX)
    currency: str | None = Field(default=None, min_length=1, max_length=8)


class TransactionIn(BaseModel):
    date: str
    merchant: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=40)
    amount: float = Field(gt=0)

    _d = field_validator("date")(_valid_date)


class TransactionPatch(BaseModel):
    date: str | None = None
    merchant: str | None = Field(default=None, min_length=1, max_length=80)
    category: str | None = Field(default=None, min_length=1, max_length=40)
    amount: float | None = Field(default=None, gt=0)

    @field_validator("date")
    @classmethod
    def _d(cls, v):
        return _valid_date(v) if v is not None else v


class BillIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    due_date: str
    amount: float = Field(gt=0)
    autopay: bool = False

    _d = field_validator("due_date")(_valid_date)


class BillPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    due_date: str | None = None
    amount: float | None = Field(default=None, gt=0)
    autopay: bool | None = None

    @field_validator("due_date")
    @classmethod
    def _d(cls, v):
        return _valid_date(v) if v is not None else v


class InvestmentIn(BaseModel):
    instrument: str = Field(min_length=1, max_length=80)
    value: float = Field(ge=0)
    monthly_contribution: float = Field(default=0, ge=0)
    liquid: bool = True


class InvestmentPatch(BaseModel):
    instrument: str | None = Field(default=None, min_length=1, max_length=80)
    value: float | None = Field(default=None, ge=0)
    monthly_contribution: float | None = Field(default=None, ge=0)
    liquid: bool | None = None


class AdviseRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    session_id: str | None = None
