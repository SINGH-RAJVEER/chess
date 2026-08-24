FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /train
COPY training/pyproject.toml training/uv.lock ./
RUN uv sync --frozen
COPY training .
ENV UV_FROZEN=1
CMD ["uv", "run", "bash", "train.sh"]
