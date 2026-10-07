from fastapi import APIRouter
from app.api.routes import auth, crnas, facilities, mds, schedules, workforce, driscoll_call

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(mds.router)
api_router.include_router(crnas.router)
api_router.include_router(facilities.router)
api_router.include_router(schedules.router)
api_router.include_router(driscoll_call.router)

api_router.include_router(workforce.router)
