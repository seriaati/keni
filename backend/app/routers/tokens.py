from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.api_token import APIToken
from app.models.user import User
from app.schemas.token import TokenCreate, TokenCreateResponse, TokenResponse
from app.services.auth import generate_api_token, hash_api_token

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _to_response(token: APIToken) -> TokenResponse:
    return TokenResponse(
        id=token.id,
        name=token.name,
        last_used=token.last_used,
        created_at=token.created_at,
        expires_at=token.expires_at,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_token(
    body: TokenCreate, current_user: CurrentUser, session: DbDep
) -> TokenCreateResponse:
    raw_token = generate_api_token()
    token = APIToken(
        user_id=current_user.id,
        name=body.name,
        token_hash=hash_api_token(raw_token),
        expires_at=body.expires_at,
    )
    session.add(token)
    await session.commit()
    await session.refresh(token)
    return TokenCreateResponse(
        id=token.id,
        name=token.name,
        last_used=token.last_used,
        created_at=token.created_at,
        expires_at=token.expires_at,
        token=raw_token,
    )


@router.get("")
async def list_tokens(current_user: CurrentUser, session: DbDep) -> list[TokenResponse]:
    result = await session.exec(select(APIToken).where(APIToken.user_id == current_user.id))
    return [_to_response(t) for t in result.all()]


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(token_id: uuid.UUID, current_user: CurrentUser, session: DbDep) -> None:
    result = await session.exec(
        select(APIToken).where(APIToken.id == token_id, APIToken.user_id == current_user.id)
    )
    token = result.first()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")
    await session.delete(token)
    await session.commit()
