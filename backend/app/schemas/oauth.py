from __future__ import annotations

from pydantic import BaseModel


class OAuthRequestInfo(BaseModel):
    client_id: str
    scopes: list[str]


class OAuthApproveRequest(BaseModel):
    request_id: str


class OAuthApproveResponse(BaseModel):
    redirect_url: str
