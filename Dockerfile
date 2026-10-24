FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=secret,id=build_ca,required=false if [ -f /run/secrets/build_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci; else npm ci; fi
COPY . .
RUN npm run build
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/web/package.json apps/web/package.json
RUN --mount=type=secret,id=build_ca,required=false if [ -f /run/secrets/build_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci --omit=dev; else npm ci --omit=dev; fi
RUN npm cache clean --force
COPY --from=build /app/dist/api dist/api
COPY --from=build /app/db db
COPY --from=build /app/certs certs
COPY --from=build /app/dist/scripts dist/scripts
RUN chmod -R a+rX /app
USER node
EXPOSE 4000
CMD ["node", "dist/api/server.js"]
