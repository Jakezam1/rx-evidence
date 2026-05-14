import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def _normalize_database_url(url: str) -> str:
    """Make managed Postgres URLs work with SQLAlchemy + psycopg v3."""
    if url.startswith("sqlite"):
        return url
    u = url.replace("postgres://", "postgresql://", 1)
    if u.startswith("postgresql://") and not u.startswith("postgresql+psycopg://"):
        u = "postgresql+psycopg://" + u.removeprefix("postgresql://")
    return u


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./rxevidence.db"))

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
