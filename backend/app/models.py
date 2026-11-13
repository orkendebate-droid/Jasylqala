from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Tree(Base):
    __tablename__ = "trees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    client_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    species: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    height_m: Mapped[float] = mapped_column(Float, nullable=False)
    condition: Mapped[str] = mapped_column(String(20), nullable=False, default="good", index=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    # Мягкое удаление: запись скрывается, но остаётся в базе (можно восстановить)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    tasks: Mapped[list["CareTask"]] = relationship(
        "CareTask", back_populates="tree", cascade="all, delete-orphan", order_by="CareTask.created_at.desc()"
    )


class CareTask(Base):
    __tablename__ = "care_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tree_id: Mapped[int] = mapped_column(Integer, ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True)
    task_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_before_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_after_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tree: Mapped["Tree"] = relationship("Tree", back_populates="tasks")
