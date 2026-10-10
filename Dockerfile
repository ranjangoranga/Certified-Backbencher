FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m venv /opt/reader-python && /opt/reader-python/bin/pip install --no-cache-dir -r requirements.txt
COPY package.json ./
COPY backend ./backend
COPY database ./database
COPY scripts ./scripts
COPY html ./html
COPY css ./css
COPY javascript ./javascript
ENV PYTHON=/opt/reader-python/bin/python3 STORAGE_DIR=/data NODE_ENV=production PORT=3000
RUN mkdir /data && chown -R node:node /data /app
USER node
EXPOSE 3000
CMD ["node", "backend/server.js"]
