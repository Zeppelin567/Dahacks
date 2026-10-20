FROM node:22-bookworm-slim AS web-build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/package.json
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libatomic1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node
COPY --from=web-build /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
WORKDIR /app
COPY --from=web-build /app /app
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev --project py
ENV PATH="/app/py/.venv/bin:$PATH"
ENV NODE_ENV=production PY_URL=http://127.0.0.1:8000 PORT=3000
EXPOSE 3000
CMD ["bash", "scripts/start-production.sh"]
