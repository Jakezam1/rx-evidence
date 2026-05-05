from sqlalchemy import JSON, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.db.session import Base


class Paper(Base):
    __tablename__ = "papers"

    id = Column(String, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    sha256 = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="uploaded")
    total_pages = Column(Integer, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id"), nullable=False, index=True)
    model = Column(String, nullable=False)
    prompt_version = Column(String, nullable=False)
    status = Column(String, nullable=False, default="processing")
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)


class Finding(Base):
    __tablename__ = "findings"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id"), nullable=False, index=True)
    analysis_run_id = Column(String, ForeignKey("analysis_runs.id"), nullable=False, index=True)
    category = Column(String, nullable=False)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    clinical_implication = Column(Text, nullable=False)
    statistics_json = Column(JSON, nullable=False, default={})
    confidence_level = Column(String, nullable=False)
    evidence_strength_score = Column(Float, nullable=True)
    review_status = Column(String, nullable=False, default="unreviewed")
    review_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FindingSource(Base):
    __tablename__ = "finding_sources"

    id = Column(String, primary_key=True, index=True)
    finding_id = Column(String, ForeignKey("findings.id"), nullable=False, index=True)
    text_excerpt = Column(Text, nullable=False)
    section_name = Column(String, nullable=False)
    page_hint = Column(String, nullable=False)
    paragraph_hint = Column(String, nullable=True)
    anchor_type = Column(String, nullable=False, default="paraphrase")
    anchor_match_score = Column(Float, nullable=True)


class PicoSnapshot(Base):
    __tablename__ = "pico_snapshots"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id"), nullable=False, index=True)
    population = Column(Text, nullable=True)
    intervention = Column(Text, nullable=True)
    comparator = Column(Text, nullable=True)
    outcomes_json = Column(JSON, nullable=False, default=[])


class RiskLimitations(Base):
    __tablename__ = "risk_limitations"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id"), nullable=False, index=True)
    internal_validity = Column(Text, nullable=True)
    external_validity = Column(Text, nullable=True)
    sponsorship_conflict = Column(Text, nullable=True)
    composite_endpoint_assessment = Column(Text, nullable=True)
    subgroup_assessment = Column(Text, nullable=True)


class ObservabilityEvent(Base):
    __tablename__ = "observability_events"

    id = Column(String, primary_key=True, index=True)
    paper_id = Column(String, ForeignKey("papers.id"), nullable=False, index=True)
    analysis_run_id = Column(String, ForeignKey("analysis_runs.id"), nullable=True, index=True)
    stage = Column(String, nullable=False)
    level = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=False, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now())
