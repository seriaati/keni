from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.ai_chat import chat_about_expenses

router = APIRouter(prefix="/api/chat", tags=["chat"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("")
async def chat(body: ChatRequest, current_user: CurrentUser, session: DbDep) -> ChatResponse:
    result = await chat_about_expenses(
        user_id=current_user.id, message=body.message, wallet_id=body.wallet_id, session=session
    )
    return ChatResponse(response=result.response, data=result.data)
