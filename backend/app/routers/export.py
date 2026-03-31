from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.category import Category
from app.models.expense import Expense, ExpenseTag
from app.models.tag import Tag
from app.models.user import User
from app.models.wallet import Wallet

router = APIRouter(prefix="/api/wallets/{wallet_id}/export", tags=["export"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _get_wallet_or_404(
    wallet_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> Wallet:
    result = await session.exec(
        select(Wallet).where(Wallet.id == wallet_id, Wallet.user_id == user_id)
    )
    wallet = result.first()
    if not wallet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
    return wallet


async def _build_expense_rows(
    wallet_id: uuid.UUID,
    start_date: datetime | None,
    end_date: datetime | None,
    session: AsyncSession,
) -> list[dict]:
    query = select(Expense).where(Expense.wallet_id == wallet_id)
    if start_date:
        query = query.where(col(Expense.date) >= start_date)
    if end_date:
        query = query.where(col(Expense.date) <= end_date)
    query = query.order_by(col(Expense.date).desc())

    result = await session.exec(query)
    expenses = result.all()

    rows = []
    for expense in expenses:
        cat_result = await session.exec(select(Category).where(Category.id == expense.category_id))
        cat = cat_result.first()
        category_name = cat.name if cat else "Unknown"

        tag_result = await session.exec(
            select(Tag)
            .join(ExpenseTag, col(Tag.id) == col(ExpenseTag.tag_id))
            .where(col(ExpenseTag.expense_id) == expense.id)
        )
        tag_names = [t.name for t in tag_result.all()]

        rows.append(
            {
                "id": str(expense.id),
                "wallet_id": str(expense.wallet_id),
                "category": category_name,
                "amount": expense.amount,
                "description": expense.description or "",
                "date": expense.date.isoformat(),
                "tags": ", ".join(tag_names),
                "ai_context": expense.ai_context or "",
                "created_at": expense.created_at.isoformat(),
                "updated_at": expense.updated_at.isoformat(),
            }
        )
    return rows


@router.get("")
async def export_expenses(  # noqa: PLR0913, PLR0917
    wallet_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbDep,
    export_format: Annotated[str, Query(alias="format", pattern="^(csv|json)$")] = "csv",
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
) -> StreamingResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)
    rows = await _build_expense_rows(wallet_id, start_date, end_date, session)

    if export_format == "json":
        content = json.dumps(rows, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=expenses_{wallet_id}.json"},
        )

    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "id",
                "wallet_id",
                "category",
                "amount",
                "description",
                "date",
                "tags",
                "ai_context",
                "created_at",
                "updated_at",
            ],
        )
        writer.writeheader()

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=expenses_{wallet_id}.csv"},
    )
