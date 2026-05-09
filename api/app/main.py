from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(override=True)

from app.api.routes.analysis import router as analysis_router
from app.api.routes.findings import router as findings_router
from app.api.routes.observability import router as observability_router
from app.api.routes.papers import router as papers_router
from app.db.session import Base, engine
from app.services.llm import get_model, get_provider

Base.metadata.create_all(bind=engine)

app = FastAPI(title="RxEvidence API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(papers_router)
app.include_router(analysis_router)
app.include_router(findings_router)
app.include_router(observability_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/config")
def config():
    """Public read-only config for the UI to display (provider + model)."""
    return {"provider": get_provider(), "model": get_model()}
