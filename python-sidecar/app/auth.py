from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import ACCESS_TOKEN, SKIP_AUTH

_bearer = HTTPBearer(auto_error=False)


async def require_bearer(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    if SKIP_AUTH:
        return
    if not ACCESS_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Set AIBACKENDS_ACCESS_TOKEN or DEFAULT_ACCESS_TOKEN, "
                "or AIBACKENDS_SKIP_AUTH=true for local development."
            ),
        )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if credentials.credentials != ACCESS_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
