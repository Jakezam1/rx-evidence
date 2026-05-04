from typing import Optional

from pydantic import BaseModel


class PicoSnapshot(BaseModel):
    population: Optional[str] = None
    intervention: Optional[str] = None
    comparator: Optional[str] = None
    outcomes: list[str] = []
