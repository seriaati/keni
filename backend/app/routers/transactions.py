from __future__ import annotations

import base64 as _b64
import operator
import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.category import Category
from app.models.tag import Tag
from app.models.transaction import Transaction, TransactionTag
from app.models.user import User
from app.models.wallet import Wallet
from app.schemas.ai_provider import (
    AIRecurringItem,
    AITransactionGroupInfo,
    AITransactionItem,
    AITransactionsResponse,
    SuggestedTag,
    VoiceTransactionsResponse,
)
from app.schemas.transaction import (
    CategoryBrief,
    TagBrief,
    TransactionCreate,
    TransactionGroupCreate,
    TransactionListResponse,
    TransactionResponse,
    TransactionSummary,
    TransactionUpdate,
)
from app.services.ai_transaction import parse_transactions_with_ai

if TYPE_CHECKING:
    from app.services.ai_transaction import ParsedTransactionResult
from app.services.category_tag import find_or_create_category, find_or_create_tag
from app.services.pdf import extract_text_from_pdf
from app.services.voice import transcribe_audio

router = APIRouter(prefix="/api/wallets/{wallet_id}/transactions", tags=["transactions"])

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


async def _get_transaction_or_404(
    transaction_id: uuid.UUID, wallet_id: uuid.UUID, session: AsyncSession
) -> Transaction:
    result = await session.exec(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.wallet_id == wallet_id
        )
    )
    transaction = result.first()
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return transaction


async def _build_transaction_response(
    transaction: Transaction, session: AsyncSession, include_children: bool = True
) -> TransactionResponse:
    cat_result = await session.exec(select(Category).where(Category.id == transaction.category_id))
    cat = cat_result.first()
    category_brief = (
        CategoryBrief(id=cat.id, name=cat.name, icon=cat.icon, color=cat.color)
        if cat
        else CategoryBrief(id=transaction.category_id, name="Unknown", icon=None, color=None)
    )

    tag_result = await session.exec(
        select(Tag)
        .join(TransactionTag, col(Tag.id) == col(TransactionTag.tag_id))
        .where(col(TransactionTag.transaction_id) == transaction.id)
    )
    tags = [TagBrief(id=t.id, name=t.name, color=t.color) for t in tag_result.all()]

    children: list[TransactionResponse] | None = None
    if include_children and transaction.group_id is None:
        child_result = await session.exec(
            select(Transaction).where(col(Transaction.group_id) == transaction.id)
        )
        child_transactions = child_result.all()
        if child_transactions:
            children = [
                await _build_transaction_response(c, session, include_children=False)
                for c in child_transactions
            ]

    return TransactionResponse(
        id=transaction.id,
        wallet_id=transaction.wallet_id,
        category=category_brief,
        type=transaction.type,
        amount=transaction.amount,
        description=transaction.description,
        date=transaction.date,
        ai_context=transaction.ai_context,
        tags=tags,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
        group_id=transaction.group_id,
        children=children,
    )


async def _validate_tag_ids(
    tag_ids: list[uuid.UUID], user_id: uuid.UUID, session: AsyncSession
) -> None:
    for tag_id in tag_ids:
        result = await session.exec(select(Tag).where(Tag.id == tag_id, Tag.user_id == user_id))
        if not result.first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=f"Tag {tag_id} not found"
            )


async def _validate_category(
    category_id: uuid.UUID, user_id: uuid.UUID, session: AsyncSession
) -> None:
    result = await session.exec(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")


async def _create_single_transaction(
    wallet_id: uuid.UUID,
    body: TransactionCreate,
    user_id: uuid.UUID,
    session: AsyncSession,
    group_id: uuid.UUID | None = None,
) -> Transaction:
    if body.category_id is not None:
        await _validate_category(body.category_id, user_id, session)
        resolved_category_id = body.category_id
    else:
        assert body.category_name is not None
        category = await find_or_create_category(
            user_id=user_id, name=body.category_name, session=session, category_type=body.type
        )
        resolved_category_id = category.id

    await _validate_tag_ids(body.tag_ids, user_id, session)

    name_resolved_tag_ids: list[uuid.UUID] = []
    for name in body.tag_names:
        tag = await find_or_create_tag(user_id=user_id, name=name, session=session)
        name_resolved_tag_ids.append(tag.id)

    all_tag_ids = list({*body.tag_ids, *name_resolved_tag_ids})

    effective_group_id = group_id if group_id is not None else body.group_id

    transaction = Transaction(
        wallet_id=wallet_id,
        category_id=resolved_category_id,
        group_id=effective_group_id,
        type=body.type,
        amount=body.amount,
        description=body.description,
        date=body.date or datetime.now(UTC),
        ai_context=body.ai_context,
    )
    session.add(transaction)
    await session.flush()

    for tag_id in all_tag_ids:
        session.add(TransactionTag(transaction_id=transaction.id, tag_id=tag_id))

    return transaction


def _build_ai_transaction_item(parsed: ParsedTransactionResult) -> AITransactionItem:
    return AITransactionItem(
        amount=parsed.amount,
        currency=parsed.currency,
        category_name=parsed.category_name,
        is_new_category=parsed.is_new_category,
        description=parsed.description,
        date=parsed.date,
        ai_context=parsed.ai_context,
        type=parsed.type,
        suggested_tags=[SuggestedTag(name=t.name, is_new=t.is_new) for t in parsed.suggested_tags],
    )


@router.post("/ai", status_code=status.HTTP_201_CREATED)
async def create_transaction_ai(  # noqa: PLR0913, PLR0917
    wallet_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbDep,
    text: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
    x_timezone: Annotated[str | None, Header()] = None,
) -> AITransactionsResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)

    if not text and not file:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one of: text, file",
        )

    image_base64: str | None = None
    image_media_type: str | None = None
    if file:
        raw = await file.read()
        content_type = file.content_type or ""
        if content_type == "application/pdf":
            pdf_text = extract_text_from_pdf(raw)
            if pdf_text:
                text = f"{pdf_text}\n\n{text}" if text else pdf_text
        elif content_type.startswith("image/"):
            image_base64 = _b64.b64encode(raw).decode()
            image_media_type = content_type or "image/jpeg"
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unsupported file type. Only images and PDFs are accepted.",
            )

    timezone = current_user.timezone or x_timezone or None
    parsed = await parse_transactions_with_ai(
        user_id=current_user.id,
        text=text,
        image_base64=image_base64,
        image_media_type=image_media_type,
        session=session,
        timezone=timezone,
    )

    group: AITransactionGroupInfo | None = None
    if parsed.group is not None:
        g = parsed.group
        group = AITransactionGroupInfo(
            description=g.description,
            amount=g.amount,
            currency=g.currency,
            category_name=g.category_name,
            is_new_category=g.is_new_category,
            date=g.date,
            ai_context=g.ai_context,
            type=g.type,
            suggested_tags=[SuggestedTag(name=t.name, is_new=t.is_new) for t in g.suggested_tags],
        )

    recurring: AIRecurringItem | None = None
    if parsed.recurring is not None:
        r = parsed.recurring
        recurring = AIRecurringItem(
            amount=r.amount,
            currency=r.currency,
            category_name=r.category_name,
            is_new_category=r.is_new_category,
            description=r.description,
            frequency=r.frequency,
            next_due=r.next_due,
            ai_context=r.ai_context,
            type=r.type,
            suggested_tags=[SuggestedTag(name=t.name, is_new=t.is_new) for t in r.suggested_tags],
        )

    return AITransactionsResponse(
        result_type=parsed.result_type,
        expenses=[_build_ai_transaction_item(e) for e in parsed.expenses],
        group=group,
        recurring=recurring,
    )


@router.post("/voice", status_code=status.HTTP_201_CREATED)
async def create_transaction_voice(
    wallet_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbDep,
    audio: Annotated[UploadFile, File()],
    x_timezone: Annotated[str | None, Header()] = None,
) -> VoiceTransactionsResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Audio file is empty."
        )

    content_type = audio.content_type or "audio/webm"
    transcript = await transcribe_audio(audio_bytes, content_type)

    timezone = current_user.timezone or x_timezone or None
    parsed = await parse_transactions_with_ai(
        user_id=current_user.id,
        text=transcript,
        image_base64=None,
        image_media_type=None,
        session=session,
        timezone=timezone,
    )

    group: AITransactionGroupInfo | None = None
    if parsed.group is not None:
        g = parsed.group
        group = AITransactionGroupInfo(
            description=g.description,
            amount=g.amount,
            currency=g.currency,
            category_name=g.category_name,
            is_new_category=g.is_new_category,
            date=g.date,
            ai_context=g.ai_context,
            type=g.type,
            suggested_tags=[SuggestedTag(name=t.name, is_new=t.is_new) for t in g.suggested_tags],
        )

    voice_recurring: AIRecurringItem | None = None
    if parsed.recurring is not None:
        r = parsed.recurring
        voice_recurring = AIRecurringItem(
            amount=r.amount,
            currency=r.currency,
            category_name=r.category_name,
            is_new_category=r.is_new_category,
            description=r.description,
            frequency=r.frequency,
            next_due=r.next_due,
            ai_context=r.ai_context,
            type=r.type,
            suggested_tags=[SuggestedTag(name=t.name, is_new=t.is_new) for t in r.suggested_tags],
        )

    return VoiceTransactionsResponse(
        transcript=transcript,
        result_type=parsed.result_type,
        expenses=[_build_ai_transaction_item(e) for e in parsed.expenses],
        group=group,
        recurring=voice_recurring,
    )


@router.post("/groups", status_code=status.HTTP_201_CREATED)
async def create_transaction_group(
    wallet_id: uuid.UUID, body: TransactionGroupCreate, current_user: CurrentUser, session: DbDep
) -> TransactionResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)

    parent = await _create_single_transaction(wallet_id, body.group, current_user.id, session)

    expected_total = sum(item.amount for item in body.items)
    if abs(expected_total - body.group.amount) > 0.001:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Sum of children amounts ({expected_total}) must equal group amount ({body.group.amount})",
        )

    for item in body.items:
        await _create_single_transaction(
            wallet_id, item, current_user.id, session, group_id=parent.id
        )

    await session.commit()
    await session.refresh(parent)
    return await _build_transaction_response(parent, session)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_transaction(
    wallet_id: uuid.UUID, body: TransactionCreate, current_user: CurrentUser, session: DbDep
) -> TransactionResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)

    transaction = await _create_single_transaction(wallet_id, body, current_user.id, session)

    await session.commit()
    await session.refresh(transaction)
    return await _build_transaction_response(transaction, session)


@router.get("/summary")
async def get_transaction_summary(
    wallet_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbDep,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
) -> TransactionSummary:
    await _get_wallet_or_404(wallet_id, current_user.id, session)

    base_query = select(Transaction).where(
        Transaction.wallet_id == wallet_id, col(Transaction.group_id).is_(None)
    )
    if start_date:
        base_query = base_query.where(col(Transaction.date) >= start_date)
    if end_date:
        base_query = base_query.where(col(Transaction.date) <= end_date)

    result = await session.exec(base_query)
    transactions = result.all()

    expenses = [t for t in transactions if t.type == "expense"]
    income = [t for t in transactions if t.type == "income"]

    by_category: dict[uuid.UUID, dict] = {}
    for t in expenses:
        if t.category_id not in by_category:
            cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
            cat = cat_result.first()
            by_category[t.category_id] = {
                "category_id": str(t.category_id),
                "category_name": cat.name if cat else "Unknown",
                "category_color": cat.color if cat else None,
                "total": 0.0,
                "count": 0,
            }
        by_category[t.category_id]["total"] += t.amount
        by_category[t.category_id]["count"] += 1

    income_by_category: dict[uuid.UUID, dict] = {}
    for t in income:
        if t.category_id not in income_by_category:
            cat_result = await session.exec(select(Category).where(Category.id == t.category_id))
            cat = cat_result.first()
            income_by_category[t.category_id] = {
                "category_id": str(t.category_id),
                "category_name": cat.name if cat else "Unknown",
                "category_color": cat.color if cat else None,
                "total": 0.0,
                "count": 0,
            }
        income_by_category[t.category_id]["total"] += t.amount
        income_by_category[t.category_id]["count"] += 1

    by_period: dict[str, dict] = {}
    for t in expenses:
        period_key = t.date.strftime("%Y-%m")
        if period_key not in by_period:
            by_period[period_key] = {"period": period_key, "total": 0.0, "count": 0}
        by_period[period_key]["total"] += t.amount
        by_period[period_key]["count"] += 1

    return TransactionSummary(
        total_amount=sum(t.amount for t in expenses),
        expense_count=len(expenses),
        total_income=sum(t.amount for t in income),
        income_count=len(income),
        by_category=list(by_category.values()),
        income_by_category=list(income_by_category.values()),
        by_period=sorted(by_period.values(), key=operator.itemgetter("period")),
    )


@router.get("")
async def list_transactions(  # noqa: PLR0913, PLR0917
    wallet_id: uuid.UUID,
    current_user: CurrentUser,
    session: DbDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    start_date: Annotated[datetime | None, Query()] = None,
    end_date: Annotated[datetime | None, Query()] = None,
    category_id: Annotated[uuid.UUID | None, Query()] = None,
    tag_ids: Annotated[list[uuid.UUID] | None, Query()] = None,
    min_amount: Annotated[float | None, Query()] = None,
    max_amount: Annotated[float | None, Query()] = None,
    search: Annotated[str | None, Query()] = None,
    sort_by: Annotated[str, Query(pattern="^(date|amount|category)$")] = "date",
    sort_order: Annotated[str, Query(pattern="^(asc|desc)$")] = "desc",
    include_children: Annotated[bool, Query()] = False,
    transaction_type: Annotated[
        str | None, Query(alias="type", pattern="^(expense|income)$")
    ] = None,
) -> TransactionListResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)

    query = select(Transaction).where(Transaction.wallet_id == wallet_id)

    if not include_children:
        query = query.where(col(Transaction.group_id).is_(None))

    if transaction_type is not None:
        query = query.where(Transaction.type == transaction_type)
    if start_date:
        query = query.where(col(Transaction.date) >= start_date)
    if end_date:
        query = query.where(col(Transaction.date) <= end_date)
    if category_id:
        query = query.where(Transaction.category_id == category_id)
    if min_amount is not None:
        query = query.where(col(Transaction.amount) >= min_amount)
    if max_amount is not None:
        query = query.where(col(Transaction.amount) <= max_amount)
    if search:
        query = query.where(col(Transaction.description).ilike(f"%{search}%"))
    if tag_ids:
        query = (
            query.join(TransactionTag, col(Transaction.id) == col(TransactionTag.transaction_id))
            .where(col(TransactionTag.tag_id).in_(tag_ids))
            .distinct()
        )

    count_result = await session.exec(select(func.count()).select_from(query.subquery()))
    total = count_result.one()

    order_col = col(Transaction.amount) if sort_by == "amount" else col(Transaction.date)
    if sort_order == "desc":
        query = query.order_by(order_col.desc())
    else:
        query = query.order_by(order_col.asc())

    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await session.exec(query)
    transactions = result.all()

    items = [await _build_transaction_response(t, session) for t in transactions]

    return TransactionListResponse(items=items, total=int(total), page=page, page_size=page_size)


@router.get("/{transaction_id}")
async def get_transaction(
    wallet_id: uuid.UUID, transaction_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> TransactionResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)
    transaction = await _get_transaction_or_404(transaction_id, wallet_id, session)
    return await _build_transaction_response(transaction, session)


@router.patch("/{transaction_id}")
async def update_transaction(
    wallet_id: uuid.UUID,
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    current_user: CurrentUser,
    session: DbDep,
) -> TransactionResponse:
    await _get_wallet_or_404(wallet_id, current_user.id, session)
    transaction = await _get_transaction_or_404(transaction_id, wallet_id, session)

    if body.category_id is not None:
        await _validate_category(body.category_id, current_user.id, session)
        transaction.category_id = body.category_id
    if body.type is not None:
        transaction.type = body.type
    if body.amount is not None:
        transaction.amount = body.amount
    if body.description is not None:
        transaction.description = body.description
    if body.date is not None:
        transaction.date = body.date

    transaction.updated_at = datetime.now(UTC)

    if body.tag_ids is not None:
        await _validate_tag_ids(body.tag_ids, current_user.id, session)
        existing = await session.exec(
            select(TransactionTag).where(col(TransactionTag.transaction_id) == transaction.id)
        )
        for tt in existing.all():
            await session.delete(tt)
        for tag_id in body.tag_ids:
            session.add(TransactionTag(transaction_id=transaction.id, tag_id=tag_id))

    session.add(transaction)
    await session.commit()
    await session.refresh(transaction)
    return await _build_transaction_response(transaction, session)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    wallet_id: uuid.UUID, transaction_id: uuid.UUID, current_user: CurrentUser, session: DbDep
) -> None:
    await _get_wallet_or_404(wallet_id, current_user.id, session)
    transaction = await _get_transaction_or_404(transaction_id, wallet_id, session)

    existing = await session.exec(
        select(TransactionTag).where(col(TransactionTag.transaction_id) == transaction.id)
    )
    for tt in existing.all():
        await session.delete(tt)

    await session.delete(transaction)
    await session.commit()
