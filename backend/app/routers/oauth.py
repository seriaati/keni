from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.oauth import OAuthApproveRequest, OAuthApproveResponse, OAuthRequestInfo
from app.services.mcp_oauth import oauth_provider

CurrentUser = Annotated[User, Depends(get_current_user)]

router = APIRouter(prefix="/api/oauth", tags=["oauth"])


@router.get("/requests/{request_id}", response_model=OAuthRequestInfo)
async def get_oauth_request(request_id: str) -> OAuthRequestInfo:
    pending = await oauth_provider.get_pending_request(request_id)
    if not pending:
        raise HTTPException(status_code=404, detail="Request not found or expired")
    return OAuthRequestInfo(client_id=pending.client_id, scopes=json.loads(pending.scopes))


@router.post("/approve", response_model=OAuthApproveResponse)
async def approve_oauth_request(
    body: OAuthApproveRequest, current_user: CurrentUser
) -> OAuthApproveResponse:
    try:
        redirect_url = await oauth_provider.approve_request(body.request_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return OAuthApproveResponse(redirect_url=redirect_url)
