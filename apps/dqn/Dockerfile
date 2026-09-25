# Training container for research use (the DQN opponent is retired from
# serving; see docs/dqn.md). Build with podman using apps/dqn as context:
#   podman build -f apps/dqn/Dockerfile -t chess-train apps/dqn
# GPU training under podman needs a CDI device pass-through, e.g.
#   podman run --device nvidia.com/gpu=all chess-train
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /train
COPY training/pyproject.toml training/uv.lock ./
RUN uv sync --frozen
COPY training .
ENV UV_FROZEN=1
CMD ["uv", "run", "bash", "train.sh"]
