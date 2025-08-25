# 📋 Product Requirements Document (PRD)
**Project:** ForgeFlow v2 (FF2) – ML-Enhanced Memory, Knowledge & Context  
**Version:** 1.0  
**Author:** [Your Name]  
**Date:** [Insert Date]

---

## 1. Executive Summary
ForgeFlow v2 (FF2) enhances Claude Code orchestration with adaptive memory, state-of-the-art retrieval, and lightweight ML for project-specific and job-specific knowledge. It is designed to remain simple to install (CLI/MCP/SDK only), future-proof (scales from SQLite to Postgres/pgvector), and transparent (debuggable provenance for all knowledge).

---

## 2. Goals & Objectives
- **Improve Agent Effectiveness:** Ensure each Claude Code agent starts with relevant project + last-job knowledge.  
- **Adaptive Retrieval:** Continuously learn from what worked in past jobs.  
- **Keep It Simple:** Install via CLI or Docker, with minimal dependencies.  
- **Future-Proof:** Enable seamless upgrade to Postgres/pgvector for scale, Supabase/Neon for multi-user.  
- **Trust & Safety:** Require provenance for every claim and enforce tests/lint/type/security before completion.  

---

## 3. Scope
### In Scope
- Context packs generated per issue.  
- Job memory (`gotchas`, decisions, contracts).  
- Project knowledge (cards, ADRs, module map).  
- Hybrid retrieval (FTS + vectors).  
- Online learning (bandit weights, optional logistic re-ranker).  
- CLI + MCP tool surface.  

### Out of Scope
- Full-scale LLM fine-tuning.  
- Heavyweight knowledge graphs.  
- External services beyond optional Postgres/Qdrant.  

---

## 4. System Architecture
**Layers:**
1. **Knowledge Layer** (global/project markdown cards).  
2. **Memory Layer** (per-issue/job JSON, runtime logs).  
3. **Index Layer** (SQLite FTS5 by default, optional Qdrant/Postgres pgvector).  
4. **Retriever Layer** (rank fusion, bandit weights, optional logistic re-ranker).  
5. **Assembler Layer** (context packs for Claude).  
6. **Evaluation Layer** (job logs, promotion/demotion of knowledge).  

---

## 5. Functional Requirements
### 5.1 Knowledge & Memory
- Store project knowledge in `knowledge/project/*.md`, ADRs in `adr/*.md`.  
- Store job memory in `.ff2/issues/<id>/memory.json`.  
- Promote recurring gotchas (≥3 times) into project cards.  

### 5.2 Retrieval & Learning
- Index code/docs into SQLite FTS5 (default).  
- Optional vector index with Qdrant or Postgres/pgvector.  
- Compute features: fts score, vector score, recency, proximity, symbol affinity.  
- Update retrieval weights after each job (bandit algorithm).  
- (Optional) Train logistic regression online for re-ranking.  

### 5.3 Context Packs
- Generated file per issue: `.ff2/contextpacks/<issue>.md`.  
- Sections: objectives, last-job knowledge, project cards, retrieved snippets, provenance, checklist.  
- Must not exceed token budget (≤5k tokens).  

### 5.4 Evaluation & Distillation
- Log outcomes per job in `.ff2/jobs.ndjson`.  
- Use logs to update weights, demote unused cards, and auto-generate ADRs.  

### 5.5 CLI & MCP
Provide identical commands as CLI and MCP tools:  
- `ff2 reindex`  
- `ff2 retrieve <issue>`  
- `ff2 assemble-context <issue>`  
- `ff2 learn <issue>`  
- `ff2 promote <issue>`  
- `ff2 why <issue>`  
- `ff2 top`  

---

## 6. Non-Functional Requirements
- **Simplicity:** Single binary (SQLite) or single container (Qdrant/Postgres).  
- **Performance:** Retrieval in <500ms for 50k files.  
- **Scalability:** Support flip to Postgres/pgvector for multi-repo, multi-user.  
- **Transparency:** `ff2 why` shows exactly why snippets were chosen.  
- **Security:** Local by default; Postgres integration via Docker/Supabase/Neon optional.  

---

## 7. Upgrade Path
- **v1:** SQLite FTS5, bandit weights, JSON memory.  
- **v2:** Add Qdrant or Postgres, logistic re-ranker, semgrep policies.  
- **v3:** Swap embeddings (`bge-small`), function-level vectors, cross-repo knowledge.  

---

## 8. Success Metrics
- Agents complete jobs faster (measured by fewer retries).  
- Increased reuse of past knowledge (≥30% context pack content from job/project memory).  
- Retrieval precision improves over time (measured by sources cited in PRs).  
- System setup time ≤5 minutes on clean machine.  

---

## 9. Risks & Mitigations
- **Risk:** Context packs exceed token limits → **Mitigation:** enforce budget slicing.  
- **Risk:** SQLite doesn’t scale for multi-user → **Mitigation:** pluggable DAL with Postgres adapter.  
- **Risk:** Bandit weights drift → **Mitigation:** normalize, allow reset.  
- **Risk:** Over-promotion of noise → **Mitigation:** threshold (≥3 recurrences) for card promotion.  

---

## 10. Deliverables
- `PRD.md` (this document).  
- `BEST_PRACTICES.md` (developer guide).  
- `ff2` CLI with required commands.  
- MCP tool definitions.  
- Schema for SQLite/Postgres/Qdrant indices.  
- Sample context packs and knowledge cards.  

