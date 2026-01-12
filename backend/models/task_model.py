from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Task:
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None  # low | medium | high
    due_date: Optional[datetime] = None
    # Optional separate due time in HH:MM (24h) for reminder scheduling
    due_time: Optional[str] = None
    completed: bool = False
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None
    id: Optional[str] = None
